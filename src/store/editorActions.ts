import { nextFreeAddress } from '@/domain/allocate'
import { parseAddress } from '@/domain/address'
import { getInstruction } from '@/domain/catalog'
import { newId } from '@/domain/ids'
import {
  appendSeriesNode,
  cloneSubtree,
  createBox,
  createCoil,
  createContact,
  createSeries,
  deleteNodeAt,
  findNodePath,
  getNodeAt,
  insertParallelNode,
  insertSeriesNode,
  normalizeRoot,
  pruneEmptyChildren,
  replaceNodeAt,
} from '@/domain/ladderOps'
import { createNetwork, createTag, createVarDecl, nextDbNumber, syncInstanceDbFields } from '@/domain/project'
import { allTags } from '@/domain/projectIndex'
import type {
  BaseDataType,
  BlockInterface,
  CallNode,
  CoilVariant,
  ContactVariant,
  DataBlock,
  LadderNetwork,
  LadderNode,
  UdtDef,
  MemoryArea,
  Operand,
  ProgramBlock,
  Project,
  Tag,
  VarDecl,
} from '@/domain/types'
import { parseTime } from '@/domain/values'
import { useProjectStore } from './projectStore'
import { useUiStore } from './uiStore'

export type InsertMode = 'series' | 'parallel'
export type InsertPosition = 'before' | 'after'

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

function getNetwork(project: Project, blockId: string, networkId: string): LadderNetwork | undefined {
  const block = project.blocks.find((item) => item.id === blockId)
  return block?.networks.find((item) => item.id === networkId)
}

function areaOfTag(tag: Tag): MemoryArea | undefined {
  if (!tag.address) return undefined
  return parseAddress(tag.address)?.area
}

function findBoolTag(project: Project, preferred: MemoryArea[]): Tag | undefined {
  const tags = allTags(project).filter((tag) => tag.dataType.kind === 'base' && tag.dataType.type === 'BOOL')
  for (const area of preferred) {
    const found = tags.find((tag) => areaOfTag(tag) === area)
    if (found) return found
  }
  return tags[0]
}

function findTagOfType(project: Project, type: BaseDataType): Tag | undefined {
  return allTags(project).find((tag) => tag.dataType.kind === 'base' && tag.dataType.type === type)
}

function uniqueTagName(project: Project, base: string): string {
  const names = new Set(allTags(project).map((tag) => tag.name.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  let index = 2
  while (names.has(`${base}${index}`.toLowerCase())) index += 1
  return `${base}${index}`
}

/** 在工程中新建一个 BOOL 标签并返回操作数；用于新插入的触点/线圈。 */
function createDefaultBoolOperand(project: Project, placement: 'contact' | 'coil'): Operand {
  const preferred: MemoryArea[] = placement === 'contact' ? ['I', 'M', 'Q'] : ['Q', 'M', 'I']
  const existing = findBoolTag(project, preferred)
  if (existing) return { kind: 'tag', tagId: existing.id }
  const area: MemoryArea = placement === 'contact' ? 'I' : 'Q'
  const name = uniqueTagName(project, placement === 'contact' ? 'Tag' : 'Output')
  const tag = createTag(name, '', { kind: 'base', type: 'BOOL' })
  tag.address = nextFreeAddress(project, area, 'BOOL')
  project.tagTables[0].tags.push(tag)
  return { kind: 'tag', tagId: tag.id }
}

function defaultOperandForParam(project: Project, type: BaseDataType | undefined, fallback?: boolean | number | string): Operand | undefined {
  if (type === undefined) return undefined
  if (fallback !== undefined) {
    if (type === 'TIME') {
      const ms = typeof fallback === 'number' ? fallback : (parseTime(String(fallback)) ?? 0)
      return { kind: 'literal', dataType: type, value: ms }
    }
    return { kind: 'literal', dataType: type, value: fallback }
  }
  if (type === 'BOOL') {
    const tag = findBoolTag(project, ['I', 'M', 'Q'])
    return tag ? { kind: 'tag', tagId: tag.id } : undefined
  }
  const tag = findTagOfType(project, type)
  if (tag) return { kind: 'tag', tagId: tag.id }
  return { kind: 'literal', dataType: type, value: 0 }
}

export function buildInstructionNode(project: Project, instructionId: string): LadderNode | undefined {
  const def = getInstruction(instructionId)
  if (!def) return undefined
  if (def.placement === 'contact' && def.contactVariant) {
    return createContact(def.contactVariant, createDefaultBoolOperand(project, 'contact'))
  }
  if (def.placement === 'coil' && def.coilVariant) {
    return createCoil(def.coilVariant, createDefaultBoolOperand(project, 'coil'))
  }
  const params: Record<string, Operand | undefined> = {}
  for (const spec of def.params) {
    if (spec.direction === 'output') {
      params[spec.name] = undefined
      continue
    }
    const type = spec.dataTypes[0]
    params[spec.name] = defaultOperandForParam(project, type, spec.defaultLiteral)
  }
  return createBox(instructionId, params)
}

/* ------------------------------------------------------------------ */
/* 网络与节点操作                                                      */
/* ------------------------------------------------------------------ */

export function addNetwork(blockId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block) return
      block.networks.push(createNetwork(`网络 ${block.networks.length + 1}`))
    },
    '新增网络',
  )
}

export function deleteNetwork(blockId: string, networkId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block || block.networks.length <= 1) return
      block.networks = block.networks.filter((network) => network.id !== networkId)
    },
    '删除网络',
  )
}

export function updateNetworkMeta(blockId: string, networkId: string, patch: Partial<Pick<LadderNetwork, 'title' | 'comment'>>): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      Object.assign(network, patch)
    },
    '修改网络属性',
    { coalesceKey: `network-meta:${networkId}` },
  )
}

export interface InsertTarget {
  nodeId?: string
  position?: InsertPosition
  mode?: InsertMode
}

export function insertInstruction(blockId: string, networkId: string, instructionId: string, target?: InsertTarget): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = buildInstructionNode(draft, instructionId)
      if (!node) return
      const root = network.root
      if (!target?.nodeId || findNodePath(root, target.nodeId) === undefined) {
        network.root = normalizeRoot(appendSeriesNode(root, node))
        return
      }
      const path = findNodePath(root, target.nodeId)
      if (!path) return
      const position = target.position ?? 'after'
      const mode = target.mode ?? 'series'
      network.root =
        mode === 'parallel'
          ? normalizeRoot(insertParallelNode(root, path, position, node))
          : normalizeRoot(insertSeriesNode(root, path, position, node))
    },
    '插入指令',
  )
}

export function insertNode(blockId: string, networkId: string, node: LadderNode, target?: InsertTarget): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const root = network.root
      if (!target?.nodeId || findNodePath(root, target.nodeId) === undefined) {
        network.root = normalizeRoot(appendSeriesNode(root, node))
        return
      }
      const path = findNodePath(root, target.nodeId)
      if (!path) return
      const position = target.position ?? 'after'
      const mode = target.mode ?? 'series'
      network.root =
        mode === 'parallel'
          ? normalizeRoot(insertParallelNode(root, path, position, node))
          : normalizeRoot(insertSeriesNode(root, path, position, node))
    },
    '插入节点',
  )
}

/**
 * 拖动已有元素到新位置。
 * 节点 id 保持不变（定时器/计数器/边沿状态按节点 id 绑定，重新生成 id 会丢状态）。
 */
export function moveNode(blockId: string, networkId: string, nodeId: string, target?: InsertTarget): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const sourcePath = findNodePath(network.root, nodeId)
      if (!sourcePath) return
      if (target?.nodeId) {
        if (target.nodeId === nodeId) return
        const targetPath = findNodePath(network.root, target.nodeId)
        if (!targetPath) return
        // 不能把元素拖进自己的子树。
        const sourceKey = sourcePath.join('.')
        const targetKey = targetPath.join('.')
        if (targetKey === sourceKey || targetKey.startsWith(`${sourceKey}.`)) return
      }
      const node = getNodeAt(network.root, sourcePath)
      if (!node) return

      // 先摘除，再按目标节点 id 重新解析路径（摘除会改变索引）。
      let root = deleteNodeAt(network.root, sourcePath)
      if (!target?.nodeId) {
        root = appendSeriesNode(root, node)
      } else {
        const targetPath = findNodePath(root, target.nodeId)
        if (!targetPath) {
          root = appendSeriesNode(root, node)
        } else {
          const position = target.position ?? 'after'
          root =
            (target.mode ?? 'series') === 'parallel'
              ? insertParallelNode(root, targetPath, position, node)
              : insertSeriesNode(root, targetPath, position, node)
        }
      }
      network.root = normalizeRoot(pruneEmptyChildren(root))
    },
    '移动元素',
  )
}

export function deleteNode(blockId: string, networkId: string, nodeId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const path = findNodePath(network.root, nodeId)
      if (!path) return
      network.root = normalizeRoot(deleteNodeAt(network.root, path))
    },
    '删除节点',
  )
}

export function setNodeOperand(blockId: string, networkId: string, nodeId: string, operand: Operand): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || (node.kind !== 'contact' && node.kind !== 'coil')) return
      node.operand = operand
    },
    '修改操作数',
    { coalesceKey: `operand:${nodeId}` },
  )
}

export function setBoxParam(blockId: string, networkId: string, nodeId: string, param: string, operand: Operand | undefined): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'box') return
      node.params[param] = operand
    },
    '修改指令参数',
    { coalesceKey: `param:${nodeId}:${param}` },
  )
}

export function setBoxLabel(blockId: string, networkId: string, nodeId: string, label: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'box') return
      node.label = label
    },
    '修改标签',
    { coalesceKey: `boxlabel:${nodeId}` },
  )
}

export function setContactVariant(blockId: string, networkId: string, nodeId: string, variant: ContactVariant): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'contact') return
      node.variant = variant
    },
    '切换触点类型',
  )
}

export function setCoilVariant(blockId: string, networkId: string, nodeId: string, variant: CoilVariant): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'coil') return
      node.variant = variant
    },
    '切换线圈类型',
  )
}

export function replaceNode(blockId: string, networkId: string, nodeId: string, replacement: LadderNode): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const path = findNodePath(network.root, nodeId)
      if (!path) return
      network.root = normalizeRoot(replaceNodeAt(network.root, path, replacement))
    },
    '替换节点',
  )
}

export function copyNode(blockId: string, networkId: string, nodeId: string): void {
  const project = useProjectStore.getState().project
  const network = getNetwork(project, blockId, networkId)
  if (!network) return
  const path = findNodePath(network.root, nodeId)
  if (!path) return
  const node = getNodeAt(network.root, path)
  if (!node) return
  useUiStore.getState().setClipboard(node)
}

export function pasteNode(blockId: string, networkId: string, target?: InsertTarget): void {
  const clipboard = useUiStore.getState().clipboard
  if (!clipboard) return
  insertNode(blockId, networkId, cloneSubtree(clipboard), target)
}

/* ------------------------------------------------------------------ */
/* 标签操作                                                            */
/* ------------------------------------------------------------------ */

export function addTag(tableId: string, tag: Tag): void {
  useProjectStore.getState().update(
    (draft) => {
      const table = draft.tagTables.find((item) => item.id === tableId) ?? draft.tagTables[0]
      if (!table) return
      table.tags.push(tag)
    },
    '新增标签',
  )
}

export function updateTag(tagId: string, patch: Partial<Tag>): void {
  useProjectStore.getState().update(
    (draft) => {
      for (const table of draft.tagTables) {
        const tag = table.tags.find((item) => item.id === tagId)
        if (tag) {
          Object.assign(tag, patch)
          return
        }
      }
    },
    '修改标签',
    { coalesceKey: `tag:${tagId}` },
  )
}

export function deleteTag(tagId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      for (const table of draft.tagTables) {
        table.tags = table.tags.filter((tag) => tag.id !== tagId)
      }
    },
    '删除标签',
  )
}

/* ------------------------------------------------------------------ */
/* 块调用                                                              */
/* ------------------------------------------------------------------ */

/** 依据 FB 接口生成实例数据块（未加入工程，调用方自行 addDataBlock）。 */
export function createInstanceDbFor(project: Project, fb: ProgramBlock): DataBlock {
  const number = nextDbNumber(project)
  const fields: VarDecl[] = [...fb.interface.inputs, ...fb.interface.outputs, ...fb.interface.inOuts, ...fb.interface.statics].map(
    (variable) => createVarDecl(variable.name, variable.dataType, variable.comment),
  )
  return {
    id: newId('db'),
    number,
    name: `${fb.name}_DB`,
    kind: 'instance',
    instanceOf: fb.id,
    fields,
  }
}

export function insertCall(blockId: string, networkId: string, call: CallNode, target?: InsertTarget): void {
  insertNode(blockId, networkId, call, target)
}

export function setCallBinding(blockId: string, networkId: string, nodeId: string, param: string, operand: Operand | undefined): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'call') return
      node.bindings[param] = operand
    },
    '修改调用实参',
    { coalesceKey: `callbinding:${nodeId}:${param}` },
  )
}

export function setCallInstance(blockId: string, networkId: string, nodeId: string, instanceDbId: string | undefined): void {
  useProjectStore.getState().update(
    (draft) => {
      const network = getNetwork(draft, blockId, networkId)
      if (!network) return
      const node = getNodeAt(network.root, findNodePath(network.root, nodeId) ?? [])
      if (!node || node.kind !== 'call') return
      node.instanceDbId = instanceDbId
    },
    '修改调用实例',
  )
}

/* ------------------------------------------------------------------ */
/* 数据块与程序块                                                      */
/* ------------------------------------------------------------------ */

export function addDataBlock(db: DataBlock): void {
  useProjectStore.getState().update(
    (draft) => {
      draft.dataBlocks.push(db)
    },
    '新增数据块',
  )
}

export function updateDataBlock(dbId: string, patch: Partial<DataBlock>): void {
  useProjectStore.getState().update(
    (draft) => {
      const db = draft.dataBlocks.find((item) => item.id === dbId)
      if (db) Object.assign(db, patch)
    },
    '修改数据块',
    { coalesceKey: `db:${dbId}` },
  )
}

export function deleteDataBlock(dbId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      draft.dataBlocks = draft.dataBlocks.filter((db) => db.id !== dbId)
    },
    '删除数据块',
  )
}

export function addDbField(dbId: string, field: VarDecl): void {
  useProjectStore.getState().update(
    (draft) => {
      const db = draft.dataBlocks.find((item) => item.id === dbId)
      db?.fields.push(field)
    },
    '新增数据块字段',
  )
}

export function updateDbField(dbId: string, fieldId: string, patch: Partial<VarDecl>): void {
  useProjectStore.getState().update(
    (draft) => {
      const db = draft.dataBlocks.find((item) => item.id === dbId)
      const field = db?.fields.find((item) => item.id === fieldId)
      if (field) Object.assign(field, patch)
    },
    '修改数据块字段',
    { coalesceKey: `dbfield:${dbId}:${fieldId}` },
  )
}

export function deleteDbField(dbId: string, fieldId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const db = draft.dataBlocks.find((item) => item.id === dbId)
      if (db) db.fields = db.fields.filter((field) => field.id !== fieldId)
    },
    '删除数据块字段',
  )
}

export function addProgramBlock(block: ProgramBlock): void {
  useProjectStore.getState().update(
    (draft) => {
      draft.blocks.push(block)
    },
    '新增程序块',
  )
}

export function updateProgramBlock(blockId: string, patch: Partial<ProgramBlock>): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (block) Object.assign(block, patch)
    },
    '修改程序块',
    { coalesceKey: `block:${blockId}` },
  )
}

/**
 * 删除程序块：同时删除它的实例数据块。
 * 仍然调用它的网络会被保留（编译时给出“调用的块不存在”诊断），
 * 调用方应在删除前提示用户。
 */
export function deleteProgramBlock(blockId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block) return
      // 至少要保留一个主程序块 OB。
      if (block.kind === 'OB' && draft.blocks.filter((item) => item.kind === 'OB').length <= 1) return
      draft.blocks = draft.blocks.filter((item) => item.id !== blockId)
      draft.dataBlocks = draft.dataBlocks.filter((db) => db.instanceOf !== blockId)
    },
    '删除程序块',
  )
}

/** 统计工程中对某个块的调用次数（用于删除前提示）。 */
export function countBlockCalls(project: Project, blockId: string): number {
  let count = 0
  const visit = (node: LadderNode): void => {
    if (node.kind === 'call' && node.blockId === blockId) count += 1
    if (node.kind === 'series' || node.kind === 'parallel') node.children.forEach(visit)
  }
  for (const block of project.blocks) {
    for (const network of block.networks) visit(network.root)
  }
  return count
}

export function addInterfaceVar(blockId: string, group: keyof BlockInterface, variable: VarDecl): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block) return
      if (group === 'returnVar') {
        block.interface.returnVar = variable
      } else {
        block.interface[group].push(variable)
      }
      syncInstanceDbFields(draft)
    },
    '新增块变量',
  )
}

export function updateInterfaceVar(blockId: string, group: keyof BlockInterface, varId: string, patch: Partial<VarDecl>): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block) return
      if (group === 'returnVar') {
        if (block.interface.returnVar) Object.assign(block.interface.returnVar, patch)
      } else {
        const variable = block.interface[group].find((item) => item.id === varId)
        if (variable) Object.assign(variable, patch)
      }
      syncInstanceDbFields(draft)
    },
    '修改块变量',
    { coalesceKey: `blockvar:${blockId}:${varId}` },
  )
}

export function deleteInterfaceVar(blockId: string, group: keyof BlockInterface, varId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      const block = draft.blocks.find((item) => item.id === blockId)
      if (!block) return
      if (group === 'returnVar') {
        block.interface.returnVar = undefined
      } else {
        block.interface[group] = block.interface[group].filter((item) => item.id !== varId)
      }
      syncInstanceDbFields(draft)
    },
    '删除块变量',
  )
}

/* ------------------------------------------------------------------ */
/* PLC 数据类型（UDT）                                                 */
/* ------------------------------------------------------------------ */

export function addUserType(udt: UdtDef): void {
  useProjectStore.getState().update(
    (draft) => {
      draft.userTypes.push(udt)
    },
    '新增 PLC 数据类型',
  )
}

export function updateUserType(udtId: string, patch: Partial<UdtDef>): void {
  useProjectStore.getState().update(
    (draft) => {
      const udt = draft.userTypes.find((item) => item.id === udtId)
      if (udt) Object.assign(udt, patch)
    },
    '修改 PLC 数据类型',
    { coalesceKey: `udt:${udtId}` },
  )
}

export function updateUdtFields(udtId: string, fields: VarDecl[]): void {
  useProjectStore.getState().update(
    (draft) => {
      const udt = draft.userTypes.find((item) => item.id === udtId)
      if (udt) udt.fields = fields
    },
    '修改 PLC 数据类型字段',
    { coalesceKey: `udtfields:${udtId}` },
  )
}

export function deleteUserType(udtId: string): void {
  useProjectStore.getState().update(
    (draft) => {
      draft.userTypes = draft.userTypes.filter((item) => item.id !== udtId)
    },
    '删除 PLC 数据类型',
  )
}

export function newEmptyNetworkRoot(): LadderNode {
  return createSeries([])
}

export function generateId(prefix: string): string {
  return newId(prefix)
}
