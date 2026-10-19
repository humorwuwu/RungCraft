import { useEffect, useMemo, useRef, useState } from 'react'
import { parseAddress } from '@/domain/address'
import { formatOperand } from '@/domain/operand'
import { findDataBlockByName, findTagByName, allTags, resolveTypePath } from '@/domain/projectIndex'
import { collectFieldPaths } from '@/domain/typeOps'
import { typeExpanderFor } from '@/domain/userTypes'
import type { BaseDataType, Operand, Project } from '@/domain/types'
import { parseLiteral } from '@/domain/values'

export interface OperandEditorProps {
  project: Project
  blockId?: string
  initial?: Operand
  expectedType?: BaseDataType
  allowEmpty?: boolean
  onCommit: (operand: Operand | undefined) => void
  onCancel: () => void
}

interface Suggestion {
  label: string
  detail: string
  operand: Operand
}

export function OperandEditor({ project, blockId, initial, expectedType, allowEmpty, onCommit, onCancel }: OperandEditorProps) {
  const [text, setText] = useState(() => (initial ? formatOperand(project, initial) : ''))
  const [highlight, setHighlight] = useState(0)
  const [invalid, setInvalid] = useState(false)
  const composingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const suggestions = useMemo<Suggestion[]>(() => {
    const query = text.trim().toLowerCase()
    const result: Suggestion[] = []
    const push = (label: string, detail: string, operand: Operand) => {
      if (query && !label.toLowerCase().includes(query)) return
      if (result.length >= 8) return
      result.push({ label, detail, operand })
    }
    const expand = typeExpanderFor(project)
    const block = blockId ? project.blocks.find((item) => item.id === blockId) : undefined
    if (block) {
      const groups = [block.interface.inputs, block.interface.outputs, block.interface.inOuts, block.interface.statics, block.interface.temps]
      for (const group of groups) {
        for (const variable of group) {
          if (variable.dataType.kind === 'base') {
            push(variable.name, '块变量', { kind: 'local', blockId: block.id, varId: variable.id })
            continue
          }
          for (const path of collectFieldPaths(variable.dataType, [variable.name], 0, expand)) {
            push(`${variable.name}.${path.join('.')}`, '块变量字段', { kind: 'local', blockId: block.id, varId: variable.id, path })
          }
        }
      }
    }
    for (const tag of allTags(project)) push(tag.name, tag.address ?? '', { kind: 'tag', tagId: tag.id })
    for (const db of project.dataBlocks) {
      if (db.kind === 'instance') continue
      for (const field of db.fields) {
        for (const path of collectFieldPaths(field.dataType, [field.name], 0, expand)) {
          push(`"${db.name}".${path.join('.')}`, `DB${db.number}`, { kind: 'dbField', dbId: db.id, path })
        }
      }
    }
    return result
  }, [project, text, blockId])

  const commitText = (raw: string): boolean => {
    const trimmed = raw.trim()
    if (!trimmed) {
      if (allowEmpty) {
        onCommit(undefined)
        return true
      }
      return false
    }
    if (parseAddress(trimmed)) {
      onCommit({ kind: 'address', address: trimmed })
      return true
    }
    const literal = expectedType ? parseLiteral(trimmed, expectedType) : undefined
    if (literal !== undefined) {
      onCommit({ kind: 'literal', dataType: expectedType as BaseDataType, value: literal })
      return true
    }
    const tag = findTagByName(project, trimmed)
    if (tag) {
      onCommit({ kind: 'tag', tagId: tag.id })
      return true
    }
    const block = blockId ? project.blocks.find((item) => item.id === blockId) : undefined
    if (block) {
      const groups = [block.interface.inputs, block.interface.outputs, block.interface.inOuts, block.interface.statics, block.interface.temps]
      const bare = trimmed.replace(/^#/, '')
      for (const group of groups) {
        const variable = group.find((item) => item.name.toLowerCase() === bare.toLowerCase())
        if (variable) {
          onCommit({ kind: 'local', blockId: block.id, varId: variable.id })
          return true
        }
        // 复合类型的字段访问：#MyUdt.Speed / Arr.0.Value
        const [head, ...rest] = bare.split('.')
        const owner = group.find((item) => item.name.toLowerCase() === head?.toLowerCase())
        if (owner && rest.length > 0) {
          const type = resolveTypePath(owner.dataType, rest, typeExpanderFor(project))
          if (type) {
            onCommit({ kind: 'local', blockId: block.id, varId: owner.id, path: rest })
            return true
          }
        }
      }
    }
    const parts = trimmed.replace(/^"|"$/g, '').split('.')
    if (parts.length >= 2) {
      const db = findDataBlockByName(project, parts[0])
      if (db) {
        onCommit({ kind: 'dbField', dbId: db.id, path: parts.slice(1) })
        return true
      }
    }
    return false
  }

  const commitSuggestion = (suggestion: Suggestion) => {
    onCommit(suggestion.operand)
  }

  return (
    <div
      className="absolute left-0 top-0 z-30 w-56 rounded border border-accent bg-panel shadow-xl"
      // 编辑器内的点击不应冒泡到画布（否则会被当成“点击空白”而关闭编辑器）。
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        className={`field-input rounded-none border-0 border-b border-border ${invalid ? 'invalid' : ''}`}
        value={text}
        placeholder={expectedType ? `输入标签、地址或 ${expectedType}` : '输入标签或地址'}
        onChange={(event) => {
          setText(event.target.value)
          setInvalid(false)
        }}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onCompositionEnd={() => {
          composingRef.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlight((value) => Math.min(value + 1, suggestions.length - 1))
            return
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlight((value) => Math.max(value - 1, 0))
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key === 'Enter' && !composingRef.current) {
            event.preventDefault()
            const suggestion = suggestions[highlight]
            if (suggestion && text.trim().toLowerCase() !== suggestion.label.toLowerCase()) {
              commitSuggestion(suggestion)
              return
            }
            if (!commitText(text)) setInvalid(true)
          }
        }}
        onBlur={() => {
          // 组字过程中失焦不提交，避免把未上屏的拼音写进工程。
          if (composingRef.current) return
          // 失焦时仅在内容合法时提交；非法时保留输入并提示原因，不静默丢弃。
          if (!commitText(text)) setInvalid(true)
        }}
      />
      {invalid && (
        <div data-testid="operand-error" className="border-t border-border bg-panel-alt px-2 py-1 text-[11px] text-error">
          无法解析：请输入标签名、块变量、&quot;数据块&quot;.字段、绝对地址（%I0.0）或{expectedType ? ` ${expectedType} 字面量` : '字面量'}。
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="max-h-44 overflow-auto py-1">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.label}
              type="button"
              className={`flex w-full items-center justify-between px-2 py-0.5 text-left text-[12px] ${
                index === highlight ? 'bg-accent-soft' : ''
              }`}
              onMouseDown={(event) => {
                event.preventDefault()
                commitSuggestion(suggestion)
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <span>{suggestion.label}</span>
              <span className="mono text-[11px] text-faint">{suggestion.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
