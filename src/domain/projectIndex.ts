import type { DataBlock, DataTypeRef, ProgramBlock, Project, Tag, TagTable, VarDecl } from './types'

export function allTags(project: Project): Tag[] {
  return project.tagTables.flatMap((table) => table.tags)
}

export function findTagTable(project: Project, tagId: string): TagTable | undefined {
  return project.tagTables.find((table) => table.tags.some((tag) => tag.id === tagId))
}

export function findTagById(project: Project, tagId: string): Tag | undefined {
  for (const table of project.tagTables) {
    const tag = table.tags.find((item) => item.id === tagId)
    if (tag) return tag
  }
  return undefined
}

export function findTagByName(project: Project, name: string): Tag | undefined {
  const lower = name.toLowerCase()
  for (const table of project.tagTables) {
    const tag = table.tags.find((item) => item.name.toLowerCase() === lower)
    if (tag) return tag
  }
  return undefined
}

export function findBlock(project: Project, blockId: string): ProgramBlock | undefined {
  return project.blocks.find((block) => block.id === blockId)
}

export function findBlockByName(project: Project, name: string): ProgramBlock | undefined {
  const lower = name.toLowerCase()
  return project.blocks.find((block) => block.name.toLowerCase() === lower)
}

export function findDataBlock(project: Project, dbId: string): DataBlock | undefined {
  return project.dataBlocks.find((db) => db.id === dbId)
}

export function findDataBlockByName(project: Project, name: string): DataBlock | undefined {
  const lower = name.toLowerCase()
  return project.dataBlocks.find((db) => db.name.toLowerCase() === lower)
}

/** 在块接口（输入/输出/输入输出/静态/临时/返回值）中按 id 查变量。 */
export function findInterfaceVar(block: ProgramBlock, varId: string): VarDecl | undefined {
  const groups: VarDecl[][] = [
    block.interface.inputs,
    block.interface.outputs,
    block.interface.inOuts,
    block.interface.statics,
    block.interface.temps,
  ]
  for (const group of groups) {
    const found = group.find((item) => item.id === varId)
    if (found) return found
  }
  if (block.interface.returnVar && block.interface.returnVar.id === varId) return block.interface.returnVar
  return undefined
}

/**
 * 沿路径解析类型：支持结构体字段名、UDT 展开和数组下标（数字段）。
 * 例如 Info.Speed、Arr.0.Field、Matrix.1.2。
 */
export function resolveTypePath(root: DataTypeRef, path: string[], expand?: (type: DataTypeRef) => DataTypeRef): DataTypeRef | undefined {
  let type: DataTypeRef = expand ? expand(root) : root
  for (const segment of path) {
    type = expand ? expand(type) : type
    if (type.kind === 'array') {
      if (!/^\d+$/.test(segment)) return undefined
      type = type.element
      continue
    }
    if (type.kind !== 'struct') return undefined
    const lower = segment.toLowerCase()
    const field = type.fields.find((item) => item.name.toLowerCase() === lower)
    if (!field) return undefined
    type = field.dataType
  }
  return expand ? expand(type) : type
}

/** 按路径在 DB 字段（含结构体/UDT/数组下标）中查类型。 */
export function findDbField(db: DataBlock, path: string[], expand?: (type: DataTypeRef) => DataTypeRef): VarDecl | undefined {
  const type = resolveTypePath({ kind: 'struct', fields: db.fields }, path, expand)
  if (!type) return undefined
  return { id: `path:${path.join('.')}`, name: path[path.length - 1] ?? '', dataType: type }
}

export function findInterfaceVarByPath(
  block: ProgramBlock,
  path: string[],
  expand?: (type: DataTypeRef) => DataTypeRef,
): VarDecl | undefined {
  const root: DataTypeRef = {
    kind: 'struct',
    fields: [
      ...block.interface.inputs,
      ...block.interface.outputs,
      ...block.interface.inOuts,
      ...block.interface.statics,
      ...block.interface.temps,
    ],
  }
  const type = resolveTypePath(root, path, expand)
  if (!type) return undefined
  return { id: `path:${path.join('.')}`, name: path[path.length - 1] ?? '', dataType: type }
}
