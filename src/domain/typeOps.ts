import { newId } from './ids'
import type { DataTypeRef, VarDecl } from './types'

/** 在结构体类型中按字段索引路径定位并替换子结构。path 为每层结构体的字段下标。 */
function mapStruct(type: DataTypeRef, path: number[], updater: (struct: Extract<DataTypeRef, { kind: 'struct' }>) => DataTypeRef): DataTypeRef {
  if (type.kind !== 'struct') return type
  if (path.length === 0) return updater(type)
  const [index, ...rest] = path
  const fields = type.fields.slice()
  const target = fields[index]
  if (!target) return type
  fields[index] = { ...target, dataType: mapStruct(target.dataType, rest, updater) }
  return { ...type, fields }
}

export function addStructField(type: DataTypeRef, path: number[], field: VarDecl): DataTypeRef {
  return mapStruct(type, path, (struct) => ({ ...struct, fields: [...struct.fields, field] }))
}

export function removeStructField(type: DataTypeRef, path: number[], index: number): DataTypeRef {
  return mapStruct(type, path, (struct) => ({ ...struct, fields: struct.fields.filter((_, i) => i !== index) }))
}

export function updateStructField(type: DataTypeRef, path: number[], patch: Partial<VarDecl>): DataTypeRef {
  if (type.kind !== 'struct' || path.length === 0) return type
  const [index, ...rest] = path
  const fields = type.fields.slice()
  const target = fields[index]
  if (!target) return type
  fields[index] = rest.length === 0 ? { ...target, ...patch } : { ...target, dataType: updateStructField(target.dataType, rest, patch) }
  return { ...type, fields }
}

export function setStructFieldType(type: DataTypeRef, path: number[], nextType: DataTypeRef): DataTypeRef {
  if (type.kind !== 'struct' || path.length === 0) return type
  const [index, ...rest] = path
  const fields = type.fields.slice()
  const target = fields[index]
  if (!target) return type
  fields[index] = rest.length === 0 ? { ...target, dataType: nextType } : { ...target, dataType: setStructFieldType(target.dataType, rest, nextType) }
  return { ...type, fields }
}

export function makeStructField(name: string, dataType: DataTypeRef): VarDecl {
  return { id: newId('var'), name, dataType }
}

/**
 * 收集结构体/UDT/数组类型下的所有叶子字段路径，用于操作数自动补全与在线订阅。
 * expand 用于把 UDT 引用展开为结构体（不传则 UDT 引用按叶子处理）。
 */
export function collectFieldPaths(
  type: DataTypeRef,
  prefix: string[] = [],
  depth = 0,
  expand?: (type: DataTypeRef) => DataTypeRef,
): string[][] {
  if (depth > 4) return []
  const resolved = expand ? expand(type) : type
  if (resolved.kind === 'base') return [prefix]
  if (resolved.kind === 'array') {
    return collectFieldPaths(resolved.element, [...prefix, '0'], depth + 1, expand)
  }
  if (resolved.kind === 'udt' || resolved.kind === 'instance') return [prefix]
  return resolved.fields.flatMap((field) => collectFieldPaths(field.dataType, [...prefix, field.name], depth + 1, expand))
}
