import type { DataTypeRef, Project, UdtDef, VarDecl } from './types'

/** 工程里的 UDT 列表；对缺少该字段的旧工程（v1）返回空数组。 */
export function userTypesOf(project: Project): UdtDef[] {
  return project.userTypes ?? []
}

/** 按 id 查 UDT 定义。 */
export function findUdt(project: Project, udtId: string): UdtDef | undefined {
  return userTypesOf(project).find((udt) => udt.id === udtId)
}

export function findUdtByName(project: Project, name: string): UdtDef | undefined {
  const lower = name.trim().toLowerCase()
  return userTypesOf(project).find((udt) => udt.name.toLowerCase() === lower)
}

/** UDT 的类型引用写法。 */
export function udtType(udtId: string): DataTypeRef {
  return { kind: 'udt', udtId }
}

/** UDT 展开成的内联结构体类型。 */
export function udtStruct(udt: UdtDef): DataTypeRef {
  return { kind: 'struct', fields: udt.fields }
}

/**
 * 类型展开器：把 `{ kind: 'udt' }` 引用递归替换为内联结构体，
 * 使布局、路径解析、自动补全等逻辑只需处理 base/array/struct/instance。
 * 带环保护：自引用或互相引用的 UDT 展开为空结构体，由校验另行报错。
 */
export function expandType(type: DataTypeRef, lookup: (udtId: string) => UdtDef | undefined): DataTypeRef {
  const memo = new Map<string, DataTypeRef>()

  const expandUdt = (udtId: string, stack: Set<string>): DataTypeRef => {
    const cached = memo.get(udtId)
    if (cached) return cached
    if (stack.has(udtId)) return { kind: 'struct', fields: [] }
    stack.add(udtId)
    const udt = lookup(udtId)
    const fields: VarDecl[] = (udt?.fields ?? []).map((field) => ({ ...field, dataType: walk(field.dataType, stack) }))
    stack.delete(udtId)
    const result: DataTypeRef = { kind: 'struct', fields }
    memo.set(udtId, result)
    return result
  }

  const walk = (node: DataTypeRef, stack: Set<string>): DataTypeRef => {
    switch (node.kind) {
      case 'udt':
        return expandUdt(node.udtId, stack)
      case 'array':
        return { ...node, element: walk(node.element, stack) }
      case 'struct':
        return { ...node, fields: node.fields.map((field) => ({ ...field, dataType: walk(field.dataType, stack) })) }
      default:
        return node
    }
  }

  return walk(type, new Set())
}

export type TypeExpander = (type: DataTypeRef) => DataTypeRef

const expanderCache = new WeakMap<Project, TypeExpander>()

/** 取工程对应的类型展开器（按工程对象缓存）。 */
export function typeExpanderFor(project: Project): TypeExpander {
  const cached = expanderCache.get(project)
  if (cached) return cached
  const expander: TypeExpander = (type) => expandType(type, (udtId) => findUdt(project, udtId))
  expanderCache.set(project, expander)
  return expander
}

/** 收集类型中引用到的 UDT id（含嵌套与数组元素）。 */
export function collectUdtRefs(type: DataTypeRef, out = new Set<string>()): Set<string> {
  if (type.kind === 'udt') out.add(type.udtId)
  else if (type.kind === 'array') collectUdtRefs(type.element, out)
  else if (type.kind === 'struct') for (const field of type.fields) collectUdtRefs(field.dataType, out)
  return out
}

/** 校验 UDT 定义与所有引用点：重名、空名、未知引用与循环引用。 */
export function validateUserTypes(project: Project): string[] {
  const errors: string[] = []
  const byName = new Map<string, number>()
  const userTypes = userTypesOf(project)
  for (const udt of userTypes) {
    const key = udt.name.trim().toLowerCase()
    if (!key) {
      errors.push('存在名称为空的 PLC 数据类型。')
      continue
    }
    byName.set(key, (byName.get(key) ?? 0) + 1)
  }
  for (const [name, count] of byName) {
    if (count > 1) errors.push(`PLC 数据类型名 ${name} 重复。`)
  }

  const known = new Set(userTypes.map((udt) => udt.id))
  const missing = (where: string, types: DataTypeRef[]): void => {
    for (const type of types) {
      for (const ref of collectUdtRefs(type)) {
        if (!known.has(ref)) errors.push(`${where} 引用了不存在的 PLC 数据类型。`)
      }
    }
  }
  for (const udt of userTypes) missing(`PLC 数据类型 ${udt.name}`, udt.fields.map((field) => field.dataType))
  for (const db of project.dataBlocks) missing(`数据块 ${db.name}`, db.fields.map((field) => field.dataType))
  for (const block of project.blocks) {
    const decls = [
      ...block.interface.inputs,
      ...block.interface.outputs,
      ...block.interface.inOuts,
      ...block.interface.statics,
      ...block.interface.temps,
    ]
    missing(`块 ${block.name}`, decls.map((decl) => decl.dataType))
  }
  for (const table of project.tagTables) missing(`变量表 ${table.name}`, table.tags.map((tag) => tag.dataType))

  // 循环引用检测：沿着“UDT -> UDT”的边做 DFS。
  const edges = new Map<string, string[]>()
  for (const udt of userTypes) {
    edges.set(udt.id, [...collectUdtRefs({ kind: 'struct', fields: udt.fields })].filter((id) => known.has(id)))
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const nameOf = (id: string) => userTypes.find((udt) => udt.id === id)?.name ?? id
  const visit = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      const cycle = [...stack.slice(stack.indexOf(id)), id].map(nameOf).join(' → ')
      errors.push(`PLC 数据类型循环引用：${cycle}。`)
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of edges.get(id) ?? []) visit(next, [...stack, id])
    visiting.delete(id)
    visited.add(id)
  }
  for (const udt of userTypes) visit(udt.id, [])

  return errors
}
