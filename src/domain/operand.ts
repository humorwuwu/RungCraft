import { parseAddress } from './address'
import { findBlock, findDataBlock, findDbField, findInterfaceVar, findTagById, resolveTypePath } from './projectIndex'
import type { DataTypeRef, Operand, Project } from './types'
import { baseType } from './types'
import { typeExpanderFor } from './userTypes'
import { formatLiteral } from './values'

/** 生成操作数稳定键，用于比较与映射（不含显示名）。 */
export function operandKey(operand: Operand): string {
  switch (operand.kind) {
    case 'literal':
      return `lit:${operand.dataType}:${String(operand.value)}`
    case 'tag':
      return `tag:${operand.tagId}`
    case 'dbField':
      return `db:${operand.dbId}:${operand.path.join('.')}`
    case 'local':
      return `local:${operand.blockId}:${operand.varId}${operand.path?.length ? `:${operand.path.join('.')}` : ''}`
    case 'instance':
      return `inst:${operand.instanceDbId}:${operand.path.join('.')}`
    case 'address':
      return `addr:${operand.address.toUpperCase()}`
  }
}

export function operandsEqual(a: Operand, b: Operand): boolean {
  return operandKey(a) === operandKey(b)
}

/** 供 UI 显示的操作数文本。 */
export function formatOperand(project: Project, operand: Operand | undefined): string {
  if (!operand) return ''
  switch (operand.kind) {
    case 'literal':
      return formatLiteral(operand.value, operand.dataType)
    case 'tag': {
      const tag = findTagById(project, operand.tagId)
      return tag ? tag.name : '⟨已删除标签⟩'
    }
    case 'dbField': {
      const db = findDataBlock(project, operand.dbId)
      return db ? `"${db.name}".${operand.path.join('.')}` : '⟨已删除数据块⟩'
    }
    case 'local': {
      const block = findBlock(project, operand.blockId)
      const variable = block ? findInterfaceVar(block, operand.varId) : undefined
      if (!variable) return '⟨已删除变量⟩'
      return operand.path?.length ? `${variable.name}.${operand.path.join('.')}` : variable.name
    }
    case 'instance': {
      const db = findDataBlock(project, operand.instanceDbId)
      return db ? `"${db.name}".${operand.path.join('.')}` : '⟨已删除实例⟩'
    }
    case 'address':
      return operand.address
  }
}

/** 推断操作数的数据类型；无法确定时返回 undefined。UDT 会被展开为内联结构体。 */
export function operandType(project: Project, operand: Operand): DataTypeRef | undefined {
  const expand = typeExpanderFor(project)
  switch (operand.kind) {
    case 'literal':
      return baseType(operand.dataType)
    case 'tag':
      return findTagById(project, operand.tagId)?.dataType
    case 'dbField': {
      const db = findDataBlock(project, operand.dbId)
      return db ? findDbField(db, operand.path, expand)?.dataType : undefined
    }
    case 'local': {
      const block = findBlock(project, operand.blockId)
      const variable = block ? findInterfaceVar(block, operand.varId) : undefined
      if (!variable) return undefined
      if (!operand.path?.length) return expand(variable.dataType)
      return resolveTypePath(variable.dataType, operand.path, expand)
    }
    case 'instance': {
      const db = findDataBlock(project, operand.instanceDbId)
      return db ? findDbField(db, operand.path, expand)?.dataType : undefined
    }
    case 'address': {
      const parsed = parseAddress(operand.address)
      if (!parsed) return undefined
      switch (parsed.size) {
        case 'bit':
          return baseType('BOOL')
        case 'byte':
          return baseType('BYTE')
        case 'word':
          return baseType('WORD')
        case 'dword':
          return baseType('DWORD')
      }
      return undefined
    }
  }
}

/** 判断操作数是否为可写左值。 */
export function isWritable(operand: Operand): boolean {
  return operand.kind !== 'literal'
}

/** 判断操作数是否指向输入区（强制表只对 I/Q 生效）。 */
export function isForceable(project: Project, operand: Operand): boolean {
  if (operand.kind === 'address') {
    const parsed = parseAddress(operand.address)
    return parsed?.area === 'I' || parsed?.area === 'Q'
  }
  if (operand.kind === 'tag') {
    const tag = findTagById(project, operand.tagId)
    if (!tag?.address) return false
    const parsed = parseAddress(tag.address)
    return parsed?.area === 'I' || parsed?.area === 'Q'
  }
  return false
}

/** 生成用于自动补全的显示标签。 */
export function operandDisplayName(project: Project, operand: Operand): string {
  return formatOperand(project, operand)
}
