import { parseAddress } from './address'
import { findDataBlockByName, findTagByName, resolveTypePath } from './projectIndex'
import type { BaseDataType, Operand, Project } from './types'
import { typeExpanderFor } from './userTypes'
import { parseLiteral } from './values'

export interface ParseOperandOptions {
  blockId?: string
  expectedType?: BaseDataType
}

/**
 * 把用户输入的文本解析成操作数：
 *  - %I0.0 / I0.0 等绝对地址；
 *  - TRUE/FALSE、数字、T#1s 等字面量（需要 expectedType）；
 *  - 标签名；
 *  - 当前块的接口变量名；
 *  - "DB名".字段 形式的数据块字段。
 * 解析失败返回 undefined。
 */
export function parseOperandInput(project: Project, text: string, options: ParseOperandOptions = {}): Operand | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  if (parseAddress(trimmed)) return { kind: 'address', address: trimmed }

  if (options.expectedType) {
    const literal = parseLiteral(trimmed, options.expectedType)
    if (literal !== undefined) return { kind: 'literal', dataType: options.expectedType, value: literal }
  }

  const tag = findTagByName(project, trimmed)
  if (tag) return { kind: 'tag', tagId: tag.id }

  if (options.blockId) {
    const block = project.blocks.find((item) => item.id === options.blockId)
    if (block) {
      const groups = [block.interface.inputs, block.interface.outputs, block.interface.inOuts, block.interface.statics, block.interface.temps]
      const bare = trimmed.replace(/^#/, '')
      const [head, ...rest] = bare.split('.')
      for (const group of groups) {
        const variable = group.find((item) => item.name.toLowerCase() === bare.toLowerCase())
        if (variable) return { kind: 'local', blockId: block.id, varId: variable.id }
        const owner = group.find((item) => item.name.toLowerCase() === head?.toLowerCase())
        if (owner && rest.length > 0 && resolveTypePath(owner.dataType, rest, typeExpanderFor(project))) {
          return { kind: 'local', blockId: block.id, varId: owner.id, path: rest }
        }
      }
    }
  }

  const parts = trimmed.replace(/^"|"$/g, '').split('.')
  if (parts.length >= 2) {
    const db = findDataBlockByName(project, parts[0])
    if (db) return { kind: 'dbField', dbId: db.id, path: parts.slice(1) }
  }

  return undefined
}
