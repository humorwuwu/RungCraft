import { parseAddress } from '@/domain/address'
import { getInstruction } from '@/domain/catalog'
import { findDataBlock, findDbField, findTagById, allTags } from '@/domain/projectIndex'
import type { BaseDataType, DataTypeRef, LadderNode, Operand, ProgramBlock, Project, VarDecl } from '@/domain/types'
import { isCombinator } from '@/domain/types'
import { formatOperand, operandType } from '@/domain/operand'
import { parseTime } from '@/domain/values'
import type {
  CallParamSlot,
  CompiledBlock,
  CompiledBox,
  CompiledCall,
  CompiledCallBinding,
  CompiledCoil,
  CompiledCombinator,
  CompiledContact,
  CompiledNetwork,
  CompiledNode,
  CompiledOperand,
  CompiledProgram,
  Diagnostic,
} from './ir'
import { widthForBaseType } from './ir'
import {
  buildDbLayouts,
  buildLayoutEnv,
  buildTagAddresses,
  findDbFieldLayout,
  findFieldByPath,
  layoutDeclList,
  makeDiagnostic,
  memoryRefForDbField,
  memoryRefForTag,
  type LayoutEnv,
} from './memoryLayout'
import { validateUserTypes } from '@/domain/userTypes'
import type { DbFieldLayout, DbLayout } from './ir'

interface ScopeSlot {
  offset: number
  bit?: number
  width: 'bit' | 'byte' | 'word' | 'dword'
  type: BaseDataType
  /** 复合类型（结构体/UDT/数组）的子字段布局，路径相对该变量。 */
  fields?: DbFieldLayout[]
}

interface BlockScope {
  frameSlots: Map<string, ScopeSlot>
  frameSize: number
  instanceSlots: Map<string, ScopeSlot>
  params: CallParamSlot[]
}

interface CompileContext {
  project: Project
  tagAddresses: ReturnType<typeof buildTagAddresses>
  dbs: Map<string, DbLayout>
  diagnostics: Diagnostic[]
  nextSlot: () => number
  traceMap: Record<string, { inSlot: number; outSlot: number }>
  blockScopes: Map<string, BlockScope>
  block?: ProgramBlock
  scope?: BlockScope
  blockId?: string
  networkId?: string
}

export function compileProject(project: Project, buildId = `build_${Date.now()}`): CompiledProgram {
  const diagnostics: Diagnostic[] = []
  const tagAddresses = buildTagAddresses(project)
  const layoutEnv = buildLayoutEnv(project)
  for (const message of layoutEnv.errors) diagnostics.push(makeDiagnostic('error', message))
  for (const message of validateUserTypes(project)) diagnostics.push(makeDiagnostic('error', message))
  const dbLayouts = buildDbLayouts(project, layoutEnv.env)
  const dbs = new Map(dbLayouts.map((layout) => [layout.dbId, layout]))
  const blockScopes = new Map<string, BlockScope>(project.blocks.map((block) => [block.id, buildBlockScope(block, layoutEnv.env)]))
  let slot = 0
  const ctx: CompileContext = {
    project,
    tagAddresses,
    dbs,
    diagnostics,
    nextSlot: () => {
      const current = slot
      slot += 1
      return current
    },
    traceMap: {},
    blockScopes,
  }

  validateNames(project, diagnostics)
  detectRecursion(project, diagnostics)

  const blocks: CompiledBlock[] = []
  for (const block of project.blocks) {
    blocks.push(compileBlock(block, ctx))
  }

  if (!project.blocks.some((block) => block.kind === 'OB')) {
    diagnostics.push(makeDiagnostic('error', '工程中没有主程序块 OB1，无法运行仿真。'))
  }

  return {
    buildId,
    blocks,
    dbs: dbLayouts,
    memorySizes: project.settings.memorySizes,
    traceSlotCount: slot,
    diagnostics,
  }
}

function compileBlock(block: ProgramBlock, ctx: CompileContext): CompiledBlock {
  const scope = ctx.blockScopes.get(block.id)
  const compiledNetworks: CompiledNetwork[] = []
  for (const network of block.networks) {
    const networkCtx: CompileContext = { ...ctx, block, scope, blockId: block.id, networkId: network.id }
    const root = compileNode(network.root, networkCtx)
    if (root) {
      compiledNetworks.push({ id: network.id, title: network.title, root })
    }
  }
  const labels: Record<string, number> = {}
  compiledNetworks.forEach((network, index) => {
    walkCompiled(network.root, (node) => {
      if (node.kind !== 'box' || node.handler !== 'LABEL') return
      const name = node.label?.trim()
      if (!name) {
        ctx.diagnostics.push(makeDiagnostic('warning', 'LABEL 未填写标签名。', { blockId: block.id, networkId: network.id, nodeId: node.id }))
        return
      }
      if (labels[name] !== undefined) {
        ctx.diagnostics.push(makeDiagnostic('error', `标签 ${name} 重复定义。`, { blockId: block.id, networkId: network.id, nodeId: node.id }))
        return
      }
      labels[name] = index
    })
  })
  compiledNetworks.forEach((network) => {
    walkCompiled(network.root, (node) => {
      if (node.kind !== 'box' || node.handler !== 'JMP') return
      const name = node.label?.trim()
      if (!name) {
        ctx.diagnostics.push(makeDiagnostic('warning', 'JMP 未填写目标标签。', { blockId: block.id, networkId: network.id, nodeId: node.id }))
        return
      }
      if (labels[name] === undefined) {
        ctx.diagnostics.push(makeDiagnostic('error', `JMP 目标标签 ${name} 不存在。`, { blockId: block.id, networkId: network.id, nodeId: node.id }))
      }
    })
  })

  return {
    id: block.id,
    name: block.name,
    kind: block.kind,
    networks: compiledNetworks,
    frameSize: scope?.frameSize ?? 0,
    params: scope?.params ?? [],
    labels,
  }
}

function walkCompiled(node: CompiledNode, visit: (node: CompiledNode) => void): void {
  visit(node)
  if (node.kind === 'series' || node.kind === 'parallel') {
    for (const child of node.children) walkCompiled(child, visit)
  }
}

/* ------------------------------------------------------------------ */
/* 块作用域                                                            */
/* ------------------------------------------------------------------ */

function buildBlockScope(block: ProgramBlock, env: LayoutEnv): BlockScope {
  const frameDecls =
    block.kind === 'FB'
      ? block.interface.temps
      : [...block.interface.inputs, ...block.interface.outputs, ...block.interface.inOuts, ...block.interface.temps]
  const frameLayout = layoutDecls(frameDecls, env)
  const frameSlots = new Map<string, ScopeSlot>()
  for (const item of frameLayout.slots) frameSlots.set(item.varId, item.slot)

  const instanceDecls =
    block.kind === 'FB'
      ? [...block.interface.inputs, ...block.interface.outputs, ...block.interface.inOuts, ...block.interface.statics]
      : []
  const instanceLayout = layoutDecls(instanceDecls, env)
  const instanceSlots = new Map<string, ScopeSlot>()
  for (const item of instanceLayout.slots) instanceSlots.set(item.varId, item.slot)

  const params: CallParamSlot[] = []
  const paramGroups: Array<{ decls: VarDecl[]; direction: CallParamSlot['direction'] }> = [
    { decls: block.interface.inputs, direction: 'input' },
    { decls: block.interface.outputs, direction: 'output' },
    { decls: block.interface.inOuts, direction: 'inout' },
  ]
  if (block.kind === 'FB') paramGroups.push({ decls: block.interface.statics, direction: 'static' })
  for (const group of paramGroups) {
    for (const decl of group.decls) {
      if (decl.dataType.kind !== 'base') continue
      // 参数槽必须复用块作用域里的实际布局，不能单独重排。
      const slot = block.kind === 'FB' ? instanceSlots.get(decl.id) : frameSlots.get(decl.id)
      if (!slot) continue
      params.push({
        name: decl.name,
        offset: slot.offset,
        bit: slot.bit,
        width: slot.width,
        type: slot.type,
        direction: group.direction,
      })
    }
  }

  return {
    frameSlots,
    frameSize: frameLayout.sizeBytes,
    instanceSlots,
    params,
  }
}

/**
 * 为块接口变量分配调用帧/实例空间。
 * 复用与数据块完全相同的布局算法，保证 FB 实例变量的偏移与实例 DB 字段一致。
 */
function layoutDecls(decls: VarDecl[], env: LayoutEnv): { sizeBytes: number; slots: Array<{ varId: string; slot: ScopeSlot }> } {
  const { sizeBytes, items } = layoutDeclList(decls, env)
  const slots: Array<{ varId: string; slot: ScopeSlot }> = []
  for (const item of items) {
    const first = item.fields[0]
    if (!first) {
      // 空结构体/长度为 0 的数组等：不占用存储，保留一个零大小槽位以便诊断。
      slots.push({ varId: item.decl.id, slot: { offset: 0, width: 'byte', type: 'BYTE' } })
      continue
    }
    const isBase = first.path.length === 0
    slots.push({
      varId: item.decl.id,
      slot: isBase
        ? { offset: item.start, bit: first.bit, width: first.width, type: first.type.kind === 'base' ? first.type.type : 'BYTE' }
        : { offset: item.start, width: 'dword', type: 'BYTE', fields: item.fields },
    })
  }
  return { sizeBytes, slots }
}

/* ------------------------------------------------------------------ */
/* 递归检测                                                            */
/* ------------------------------------------------------------------ */

function detectRecursion(project: Project, diagnostics: Diagnostic[]): void {
  const graph = new Map<string, string[]>()
  for (const block of project.blocks) {
    const targets = new Set<string>()
    for (const network of block.networks) {
      walkCalls(network.root, (call) => {
        if (call.blockId) targets.add(call.blockId)
      })
    }
    graph.set(block.id, [...targets])
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string, stack: string[]): boolean => {
    if (visiting.has(id)) {
      const cycle = [...stack.slice(stack.indexOf(id)), id]
        .map((blockId) => project.blocks.find((block) => block.id === blockId)?.name ?? blockId)
        .join(' → ')
      diagnostics.push(makeDiagnostic('error', `检测到递归块调用：${cycle}。`))
      return true
    }
    if (visited.has(id)) return false
    visiting.add(id)
    for (const next of graph.get(id) ?? []) visit(next, [...stack, id])
    visiting.delete(id)
    visited.add(id)
    return false
  }
  for (const block of project.blocks) visit(block.id, [])
}

function walkCalls(node: LadderNode, callback: (call: Extract<LadderNode, { kind: 'call' }>) => void): void {
  if (node.kind === 'call') callback(node)
  if (isCombinator(node)) {
    for (const child of node.children) walkCalls(child, callback)
  }
}

/* ------------------------------------------------------------------ */
/* 节点编译                                                            */
/* ------------------------------------------------------------------ */

function compileNode(node: LadderNode, ctx: CompileContext): CompiledNode | undefined {
  const trace = { inSlot: ctx.nextSlot(), outSlot: ctx.nextSlot() }
  ctx.traceMap[node.id] = trace

  if (isCombinator(node)) {
    const children = node.children
      .map((child) => compileNode(child, ctx))
      .filter((child): child is CompiledNode => Boolean(child))
    if (node.children.length === 0) {
      ctx.diagnostics.push(
        makeDiagnostic('warning', `${node.kind === 'series' ? '串联' : '并联'}分支为空，请插入指令。`, location(ctx, node.id)),
      )
    }
    return { kind: node.kind, id: node.id, children, trace } satisfies CompiledCombinator
  }

  if (node.kind === 'contact') {
    const operand = compileOperand(node.operand, ctx, node.id)
    if (!operand) return undefined
    return { kind: 'contact', id: node.id, variant: node.variant, operand, trace } satisfies CompiledContact
  }

  if (node.kind === 'coil') {
    const operand = compileOperand(node.operand, ctx, node.id)
    if (!operand) return undefined
    return { kind: 'coil', id: node.id, variant: node.variant, operand, trace } satisfies CompiledCoil
  }

  if (node.kind === 'call') {
    return compileCall(node, ctx, trace)
  }

  const def = getInstruction(node.instructionId)
  if (!def) {
    ctx.diagnostics.push(makeDiagnostic('error', `未知指令 ${node.instructionId}。`, location(ctx, node.id)))
    return undefined
  }
  const params: Record<string, CompiledOperand | undefined> = {}
  for (const spec of def.params) {
    const operand = node.params[spec.name]
    if (!operand) {
      if (!spec.optional && spec.direction === 'input') {
        ctx.diagnostics.push(makeDiagnostic('warning', `${def.label} 的参数 ${spec.label} 未填写。`, location(ctx, node.id)))
      }
      params[spec.name] = undefined
      continue
    }
    params[spec.name] = compileOperand(operand, ctx, node.id)
  }
  return {
    kind: 'box',
    id: node.id,
    instructionId: node.instructionId,
    handler: def.handler,
    operator: def.extra?.operator,
    params,
    en: node.en,
    eno: node.eno,
    label: node.label,
    trace,
  } satisfies CompiledBox
}

function compileCall(node: Extract<LadderNode, { kind: 'call' }>, ctx: CompileContext, trace: CompiledNode['trace']): CompiledCall | undefined {
  const target = ctx.project.blocks.find((block) => block.id === node.blockId)
  if (!target) {
    ctx.diagnostics.push(makeDiagnostic('error', '调用的块不存在。', location(ctx, node.id)))
    return undefined
  }
  if (target.kind === 'OB') {
    ctx.diagnostics.push(makeDiagnostic('error', '不能调用 OB 主程序块。', location(ctx, node.id)))
    return undefined
  }
  let compiledInstanceRef: CompiledOperand | undefined
  if (target.kind === 'FB') {
    if (node.instanceRef) {
      const variable = node.instanceRef.kind === 'local' && ctx.block ? findBlockVar(ctx.block, node.instanceRef.varId) : undefined
      if (!variable || variable.dataType.kind !== 'instance' || variable.dataType.blockId !== target.id) {
        ctx.diagnostics.push(makeDiagnostic('error', `实例变量类型与 FB ${target.name} 不匹配。`, location(ctx, node.id)))
        return undefined
      }
      compiledInstanceRef = compileOperand(node.instanceRef, ctx, node.id)
      if (!compiledInstanceRef) return undefined
    } else if (!node.instanceDbId) {
      ctx.diagnostics.push(makeDiagnostic('error', `调用 FB ${target.name} 需要实例数据块或实例变量。`, location(ctx, node.id)))
      return undefined
    }
  }

  const targetScope = ctx.blockScopes.get(target.id)
  const bindings: CompiledCallBinding[] = []
  const groups: Array<{ decls: VarDecl[]; direction: CompiledCallBinding['direction'] }> = [
    { decls: target.interface.inputs, direction: 'input' },
    { decls: target.interface.outputs, direction: 'output' },
    { decls: target.interface.inOuts, direction: 'inout' },
  ]
  for (const group of groups) {
    for (const decl of group.decls) {
      const actualOperand = node.bindings[decl.name]
      // 复合类型（结构体/UDT/数组）参数暂不支持跨块传递，只做声明与块内访问。
      if (decl.dataType.kind !== 'base') {
        if (actualOperand) {
          ctx.diagnostics.push(
            makeDiagnostic('warning', `${target.name}.${decl.name} 是复合类型参数，当前版本不会传递实参。`, location(ctx, node.id)),
          )
        }
        bindings.push({ name: decl.name, direction: group.direction, actual: undefined })
        continue
      }
      const actual = actualOperand ? compileOperand(actualOperand, ctx, node.id) : undefined
      if (!actual && group.direction === 'input') {
        ctx.diagnostics.push(makeDiagnostic('warning', `${target.name}.${decl.name} 未连接实参。`, location(ctx, node.id)))
      }
      if (actual && group.direction === 'output' && actual.kind === 'const') {
        ctx.diagnostics.push(makeDiagnostic('error', `${target.name}.${decl.name} 是输出参数，必须连接可写变量。`, location(ctx, node.id)))
      }
      bindings.push({ name: decl.name, direction: group.direction, actual })
    }
  }
  void targetScope

  return {
    kind: 'call',
    id: node.id,
    targetBlockId: target.id,
    targetKind: target.kind,
    instanceDbId: node.instanceDbId,
    instanceRef: compiledInstanceRef,
    bindings,
    en: node.en,
    eno: node.eno,
    trace,
  }
}

function compileOperand(operand: Operand, ctx: CompileContext, nodeId: string): CompiledOperand | undefined {
  const locationInfo = location(ctx, nodeId)
  switch (operand.kind) {
    case 'literal': {
      let value: boolean | number
      if (operand.dataType === 'BOOL') {
        value = Boolean(operand.value)
      } else if (operand.dataType === 'TIME') {
        value = typeof operand.value === 'number' ? operand.value : (parseTime(String(operand.value)) ?? 0)
      } else {
        value = Number(operand.value)
      }
      return { kind: 'const', value, type: operand.dataType, display: formatOperand(ctx.project, operand) }
    }
    case 'tag': {
      const tag = findTagById(ctx.project, operand.tagId)
      if (!tag) {
        ctx.diagnostics.push(makeDiagnostic('error', '引用的标签不存在。', locationInfo))
        return undefined
      }
      const address = ctx.tagAddresses.get(tag.id)
      if (!address) {
        ctx.diagnostics.push(makeDiagnostic('error', `标签 ${tag.name} 没有可用地址。`, locationInfo))
        return undefined
      }
      if (tag.dataType.kind !== 'base') {
        ctx.diagnostics.push(makeDiagnostic('error', `标签 ${tag.name} 不是基础数据类型。`, locationInfo))
        return undefined
      }
      const ref = memoryRefForTag(tag.dataType, address, tag.name)
      if (!ref) {
        ctx.diagnostics.push(makeDiagnostic('error', `无法为标签 ${tag.name} 生成内存引用。`, locationInfo))
        return undefined
      }
      return ref
    }
    case 'dbField': {
      const layout = ctx.dbs.get(operand.dbId)
      if (!layout) {
        ctx.diagnostics.push(makeDiagnostic('error', '引用的数据块不存在。', locationInfo))
        return undefined
      }
      const field = findDbFieldLayout(layout, operand.path)
      if (!field) {
        ctx.diagnostics.push(makeDiagnostic('error', `数据块 ${layout.name} 中找不到字段 ${operand.path.join('.')}。`, locationInfo))
        return undefined
      }
      return memoryRefForDbField(layout, field, formatOperand(ctx.project, operand))
    }
    case 'local': {
      if (!ctx.block || !ctx.scope) {
        ctx.diagnostics.push(makeDiagnostic('error', '块局部变量只能在其所属块内使用。', locationInfo))
        return undefined
      }
      const variable = findBlockVar(ctx.block, operand.varId)
      if (!variable) {
        ctx.diagnostics.push(makeDiagnostic('error', '引用的块变量不存在。', locationInfo))
        return undefined
      }
      if (variable.dataType.kind === 'instance') {
        if (ctx.block.kind !== 'FB') {
          ctx.diagnostics.push(makeDiagnostic('error', `实例变量 ${variable.name} 只能作为 FB 的静态变量。`, locationInfo))
          return undefined
        }
        const slot = ctx.scope.instanceSlots.get(variable.id)
        if (!slot) {
          ctx.diagnostics.push(makeDiagnostic('error', `实例变量 ${variable.name} 没有分配存储空间。`, locationInfo))
          return undefined
        }
        return {
          kind: 'mem',
          area: 'INST',
          offset: slot.offset,
          width: 'dword',
          type: 'BYTE',
          writable: true,
          display: variable.name,
        }
      }
      const isFb = ctx.block.kind === 'FB'
      const slot = isFb ? (ctx.scope.instanceSlots.get(variable.id) ?? ctx.scope.frameSlots.get(variable.id)) : ctx.scope.frameSlots.get(variable.id)
      if (!slot) {
        ctx.diagnostics.push(makeDiagnostic('error', `块变量 ${variable.name} 没有分配存储空间。`, locationInfo))
        return undefined
      }
      const useInstance = isFb && ctx.scope.instanceSlots.has(variable.id)
      const area = useInstance ? ('INST' as const) : ('L' as const)

      if (variable.dataType.kind !== 'base') {
        // 结构体/UDT/数组变量：必须指明字段路径。
        const path = operand.path ?? []
        if (path.length === 0) {
          ctx.diagnostics.push(
            makeDiagnostic('error', `块变量 ${variable.name} 是复合类型，请使用 ${variable.name}.字段 的形式访问。`, locationInfo),
          )
          return undefined
        }
        const sub = findFieldByPath(slot.fields ?? [], path)
        if (!sub) {
          ctx.diagnostics.push(makeDiagnostic('error', `块变量 ${variable.name} 中找不到字段 ${path.join('.')}。`, locationInfo))
          return undefined
        }
        if (sub.type.kind !== 'base') {
          ctx.diagnostics.push(makeDiagnostic('error', `${variable.name}.${path.join('.')} 不是基础类型。`, locationInfo))
          return undefined
        }
        return {
          kind: 'mem',
          area,
          offset: slot.offset + sub.offset,
          bit: sub.width === 'bit' ? (sub.bit ?? 0) : undefined,
          width: sub.width,
          type: sub.type.type,
          writable: true,
          display: formatOperand(ctx.project, operand),
        }
      }

      if (operand.path?.length) {
        ctx.diagnostics.push(makeDiagnostic('error', `块变量 ${variable.name} 不是复合类型，不能访问字段。`, locationInfo))
        return undefined
      }
      return {
        kind: 'mem',
        area,
        offset: slot.offset,
        bit: slot.width === 'bit' ? (slot.bit ?? 0) : undefined,
        width: slot.width,
        type: slot.type,
        writable: true,
        display: variable.name,
      }
    }
    case 'instance': {
      const layout = ctx.dbs.get(operand.instanceDbId)
      if (!layout) {
        ctx.diagnostics.push(makeDiagnostic('error', '引用的实例数据块不存在。', locationInfo))
        return undefined
      }
      const field = findDbFieldLayout(layout, operand.path)
      if (!field) {
        ctx.diagnostics.push(makeDiagnostic('error', `实例数据块中找不到字段 ${operand.path.join('.')}。`, locationInfo))
        return undefined
      }
      return memoryRefForDbField(layout, field, formatOperand(ctx.project, operand))
    }
    case 'address': {
      const parsed = parseAddress(operand.address)
      if (!parsed) {
        ctx.diagnostics.push(makeDiagnostic('error', `地址 ${operand.address} 不合法。`, locationInfo))
        return undefined
      }
      const type: DataTypeRef =
        parsed.size === 'bit'
          ? { kind: 'base', type: 'BOOL' }
          : parsed.size === 'byte'
            ? { kind: 'base', type: 'BYTE' }
            : parsed.size === 'word'
              ? { kind: 'base', type: 'WORD' }
              : { kind: 'base', type: 'DWORD' }
      const base = type.kind === 'base' ? type.type : 'BYTE'
      return {
        kind: 'mem',
        area: parsed.area,
        offset: parsed.byte,
        bit: parsed.size === 'bit' ? (parsed.bit ?? 0) : undefined,
        width: widthForBaseType(base),
        type: base,
        writable: true,
        display: operand.address,
      }
    }
  }
}

function findBlockVar(block: ProgramBlock, varId: string): VarDecl | undefined {
  const groups = [block.interface.inputs, block.interface.outputs, block.interface.inOuts, block.interface.statics, block.interface.temps]
  for (const group of groups) {
    const found = group.find((item) => item.id === varId)
    if (found) return found
  }
  return undefined
}

function location(ctx: CompileContext, nodeId: string): Pick<Diagnostic, 'blockId' | 'networkId' | 'nodeId'> {
  return { blockId: ctx.blockId, networkId: ctx.networkId, nodeId }
}

function validateNames(project: Project, diagnostics: Diagnostic[]): void {
  const tagNames = new Map<string, number>()
  for (const tag of allTags(project)) {
    const key = tag.name.trim().toLowerCase()
    if (!key) {
      diagnostics.push(makeDiagnostic('error', '存在空名称的标签。'))
      continue
    }
    tagNames.set(key, (tagNames.get(key) ?? 0) + 1)
  }
  for (const [name, count] of tagNames) {
    if (count > 1) diagnostics.push(makeDiagnostic('error', `标签名 ${name} 重复。`))
  }
  const blockNumbers = new Map<number, number>()
  for (const block of project.blocks) {
    blockNumbers.set(block.number, (blockNumbers.get(block.number) ?? 0) + 1)
  }
  for (const [number, count] of blockNumbers) {
    if (count > 1) diagnostics.push(makeDiagnostic('error', `块编号 ${number} 重复。`))
  }
}

/** 创建一个轻量操作数解析器，供 Worker 在运行期解析监视/强制/写入目标。 */
export function createOperandResolver(project: Project): (operand: Operand) => CompiledOperand | undefined {
  const tagAddresses = buildTagAddresses(project)
  const dbLayouts = buildDbLayouts(project)
  const dbs = new Map(dbLayouts.map((layout) => [layout.dbId, layout]))
  const ctx: CompileContext = {
    project,
    tagAddresses,
    dbs,
    diagnostics: [],
    nextSlot: () => 0,
    traceMap: {},
    blockScopes: new Map(),
  }
  return (operand: Operand) => compileOperand(operand, ctx, '')
}

/** 校验操作数与参数类型是否匹配（供编辑器即时提示使用）。 */
export function operandMatchesType(project: Project, operand: Operand, expected: DataTypeRef | undefined): boolean {
  if (!expected) return true
  const actual = operandType(project, operand)
  if (!actual) return false
  if (actual.kind !== expected.kind) return false
  if (actual.kind === 'base' && expected.kind === 'base') {
    if (actual.type === expected.type) return true
    const numeric = ['BYTE', 'WORD', 'DWORD', 'INT', 'DINT', 'REAL', 'TIME']
    return numeric.includes(actual.type) && numeric.includes(expected.type)
  }
  return true
}

export function projectHasErrors(program: CompiledProgram): boolean {
  return program.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

export function dbFieldExists(project: Project, dbId: string, path: string[]): boolean {
  const db = findDataBlock(project, dbId)
  return db ? Boolean(findDbField(db, path)) : false
}
