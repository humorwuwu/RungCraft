import { parseAddress, sizeForBaseType } from '@/domain/address'
import { nextFreeAddress } from '@/domain/allocate'
import type { DataBlock, DataTypeRef, ParsedAddress, Project, VarDecl } from '@/domain/types'
import { baseByteSize } from '@/domain/address'
import type { DbFieldLayout, DbLayout, Diagnostic, MemoryRef } from './ir'
import { widthForBaseType } from './ir'

interface Cursor {
  byte: number
  bit: number
}

function align(cursor: Cursor, size: number): void {
  if (cursor.bit > 0) {
    cursor.bit = 0
    cursor.byte += 1
  }
  if (size > 1) {
    const remainder = cursor.byte % size
    if (remainder !== 0) cursor.byte += size - remainder
  }
}

/** 内存布局环境：解析 FB 实例大小、展开 UDT 引用。 */
export interface LayoutEnv {
  resolveInstanceSize: (blockId: string) => number
  resolveUdt?: (udtId: string) => DataTypeRef | undefined
}

function layoutType(type: DataTypeRef, cursor: Cursor, path: string[], out: DbFieldLayout[], env: LayoutEnv, activeUdts = new Set<string>()): void {
  switch (type.kind) {
    case 'base': {
      if (type.type === 'BOOL') {
        out.push({ path, offset: cursor.byte, bit: cursor.bit, type, width: 'bit' })
        cursor.bit += 1
        if (cursor.bit >= 8) {
          cursor.bit = 0
          cursor.byte += 1
        }
        return
      }
      const size = baseByteSize(type.type)
      align(cursor, size)
      out.push({ path, offset: cursor.byte, type, width: widthForBaseType(type.type) })
      cursor.byte += size
      return
    }
    case 'array': {
      for (let index = 0; index < type.length; index += 1) {
        layoutType(type.element, cursor, [...path, String(index)], out, env, activeUdts)
      }
      return
    }
    case 'struct': {
      for (const field of type.fields) {
        layoutType(field.dataType, cursor, [...path, field.name], out, env, activeUdts)
      }
      return
    }
    case 'udt': {
      // 展开具名类型；循环引用时跳过，避免无限递归（编译期另有诊断）。
      if (activeUdts.has(type.udtId)) return
      const expanded = env.resolveUdt?.(type.udtId)
      if (!expanded) return
      activeUdts.add(type.udtId)
      layoutType(expanded, cursor, path, out, env, activeUdts)
      activeUdts.delete(type.udtId)
      return
    }
    case 'instance': {
      const size = Math.max(4, env.resolveInstanceSize(type.blockId))
      align(cursor, 4)
      out.push({ path, offset: cursor.byte, type, width: 'dword' })
      cursor.byte += size
      return
    }
  }
}

export function layoutFields(fields: VarDecl[], env: LayoutEnv): { sizeBytes: number; fields: DbFieldLayout[] } {
  const cursor: Cursor = { byte: 0, bit: 0 }
  const out: DbFieldLayout[] = []
  for (const field of fields) {
    layoutType(field.dataType, cursor, [field.name], out, env)
  }
  const sizeBytes = cursor.bit > 0 ? cursor.byte + 1 : cursor.byte
  return { sizeBytes, fields: out }
}

/**
 * 与 layoutFields 使用同一游标，但按变量返回各自的字段布局：
 * 路径不含变量名，偏移相对该变量起点（便于与块内变量的槽位偏移相加）。
 * 供块接口的调用帧/实例布局使用，保证与数据块布局算法完全一致。
 */
export function layoutDeclList(
  decls: VarDecl[],
  env: LayoutEnv,
): { sizeBytes: number; items: Array<{ decl: VarDecl; start: number; fields: DbFieldLayout[] }> } {
  const cursor: Cursor = { byte: 0, bit: 0 }
  const items: Array<{ decl: VarDecl; start: number; fields: DbFieldLayout[] }> = []
  for (const decl of decls) {
    const out: DbFieldLayout[] = []
    layoutType(decl.dataType, cursor, [decl.name], out, env)
    const start = out[0]?.offset ?? 0
    items.push({
      decl,
      start,
      fields: out.map((field) => ({ ...field, path: field.path.slice(1), offset: field.offset - start })),
    })
  }
  const sizeBytes = cursor.bit > 0 ? cursor.byte + 1 : cursor.byte
  return { sizeBytes, items }
}

export { layoutType }

/** 计算所有 FB 的实例布局大小，支持 FB 静态变量里嵌套其它 FB 实例。 */
export function buildInstanceSizeResolver(project: Project): { sizeOf: (blockId: string) => number; errors: string[] } {
  const memo = new Map<string, number>()
  const errors: string[] = []
  const computing = new Set<string>()
  const env: LayoutEnv = { resolveInstanceSize: (blockId) => compute(blockId), resolveUdt: (udtId) => udtTypeRef(project, udtId) }

  const compute = (blockId: string): number => {
    if (memo.has(blockId)) return memo.get(blockId) ?? 0
    if (computing.has(blockId)) {
      errors.push(`块实例嵌套形成环：${blockId}`)
      return 0
    }
    const block = project.blocks.find((item) => item.id === blockId)
    if (!block || block.kind !== 'FB') return 0
    computing.add(blockId)
    const decls = [...block.interface.inputs, ...block.interface.outputs, ...block.interface.inOuts, ...block.interface.statics]
    const { sizeBytes } = layoutFields(decls, env)
    computing.delete(blockId)
    memo.set(blockId, sizeBytes)
    return sizeBytes
  }

  for (const block of project.blocks) {
    if (block.kind === 'FB') compute(block.id)
  }
  return { sizeOf: (blockId) => memo.get(blockId) ?? compute(blockId), errors }
}

/** 把 UDT 引用展开成内联结构体类型，供内存布局使用。 */
export function udtTypeRef(project: Project, udtId: string): DataTypeRef | undefined {
  const udt = (project.userTypes ?? []).find((item) => item.id === udtId)
  return udt ? { kind: 'struct', fields: udt.fields } : undefined
}

/** 工程统一的内存布局环境（含 FB 实例大小解析与 UDT 展开）。 */
export function buildLayoutEnv(project: Project): { env: LayoutEnv; errors: string[] } {
  const resolver = buildInstanceSizeResolver(project)
  return {
    env: { resolveInstanceSize: resolver.sizeOf, resolveUdt: (udtId) => udtTypeRef(project, udtId) },
    errors: resolver.errors,
  }
}

export function buildDbLayouts(project: Project, layoutEnv?: LayoutEnv): DbLayout[] {
  const env = layoutEnv ?? buildLayoutEnv(project).env
  return project.dataBlocks.map((db) => {
    const { sizeBytes, fields } = layoutFields(db.fields, env)
    return {
      dbId: db.id,
      number: db.number,
      name: db.name,
      kind: db.kind,
      sizeBytes: Math.max(sizeBytes, 1),
      fields,
    }
  })
}

/** 为没有地址的标签分配地址；返回 tagId -> ParsedAddress。 */
export function buildTagAddresses(project: Project): Map<string, ParsedAddress> {
  const result = new Map<string, ParsedAddress>()
  // 复制一份用于占用检查，避免修改原工程。
  const working: Project = {
    ...project,
    tagTables: project.tagTables.map((table) => ({ ...table, tags: table.tags.map((tag) => ({ ...tag })) })),
  }
  for (const table of working.tagTables) {
    for (const tag of table.tags) {
      if (tag.address) {
        const parsed = parseAddress(tag.address)
        if (parsed) {
          result.set(tag.id, parsed)
          continue
        }
      }
      const type = tag.dataType.kind === 'base' ? tag.dataType.type : 'BYTE'
      const area = tag.dataType.kind === 'base' && type === 'BOOL' ? 'M' : 'M'
      tag.address = nextFreeAddress(working, area, type)
      const parsed = parseAddress(tag.address)
      if (parsed) result.set(tag.id, parsed)
    }
  }
  return result
}

export function memoryRefForTag(
  type: DataTypeRef,
  address: ParsedAddress,
  display: string,
): MemoryRef | undefined {
  if (type.kind !== 'base') return undefined
  const width = widthForBaseType(type.type)
  return {
    kind: 'mem',
    area: address.area,
    offset: address.byte,
    bit: width === 'bit' ? (address.bit ?? 0) : undefined,
    width,
    type: type.type,
    writable: true,
    display,
  }
}

export function memoryRefForDbField(layout: DbLayout, field: DbFieldLayout, display: string): MemoryRef {
  const type = field.type.kind === 'base' ? field.type.type : 'BYTE'
  return {
    kind: 'mem',
    area: 'DB',
    dbId: layout.dbId,
    offset: field.offset,
    bit: field.width === 'bit' ? (field.bit ?? 0) : undefined,
    width: field.width,
    type,
    writable: true,
    display,
  }
}

export function findDbFieldLayout(layout: DbLayout, path: string[]): DbFieldLayout | undefined {
  return findFieldByPath(layout.fields, path)
}

/** 在已布局的字段列表中按路径查字段（路径大小写不敏感）。 */
export function findFieldByPath(fields: DbFieldLayout[], path: string[]): DbFieldLayout | undefined {
  const key = path.join('.').toLowerCase()
  return fields.find((field) => field.path.join('.').toLowerCase() === key)
}

export function makeDiagnostic(
  severity: Diagnostic['severity'],
  message: string,
  location?: Pick<Diagnostic, 'blockId' | 'networkId' | 'nodeId'>,
): Diagnostic {
  return {
    id: `diag_${Math.random().toString(36).slice(2, 10)}`,
    severity,
    message,
    ...location,
  }
}

/** 地址大小与标签类型是否一致。 */
export function addressMatchesType(address: ParsedAddress, type: DataTypeRef): boolean {
  if (type.kind !== 'base') return true
  const expected = sizeForBaseType(type.type)
  if (expected === 'bit') return address.size === 'bit'
  return address.size === expected || address.size === 'byte' || address.size === 'word' || address.size === 'dword'
}

export function dbFieldCount(db: DataBlock): number {
  return db.fields.length
}
