import { useMemo, useState } from 'react'
import { Button, Field, Modal } from '@/components/ui'
import { createCall } from '@/domain/ladderOps'
import { parseOperandInput } from '@/domain/operandParse'
import type { Operand, Project, VarDecl } from '@/domain/types'
import { addDataBlock, createInstanceDbFor, insertCall } from '@/store/editorActions'
import { useUiStore } from '@/store/uiStore'

export function CallDialog({
  open,
  onClose,
  project,
  blockId,
  networkId,
}: {
  open: boolean
  onClose: () => void
  project: Project
  blockId: string
  networkId: string
}) {
  const selectedNodeId = useUiStore((state) => state.selectedNodeId)
  const candidates = project.blocks.filter((block) => block.kind !== 'OB' && block.id !== blockId)
  const [targetBlockId, setTargetBlockId] = useState(candidates[0]?.id ?? '')
  const [instanceChoice, setInstanceChoice] = useState('')
  const [bindingText, setBindingText] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>('')

  const target = project.blocks.find((block) => block.id === targetBlockId)
  const instanceDbs = target ? project.dataBlocks.filter((db) => db.kind === 'instance' && db.instanceOf === target.id) : []
  const currentBlock = project.blocks.find((block) => block.id === blockId)
  const instanceVars =
    target && currentBlock?.kind === 'FB'
      ? currentBlock.interface.statics.filter((variable) => variable.dataType.kind === 'instance' && variable.dataType.blockId === target.id)
      : []

  const params = useMemo<Array<{ variable: VarDecl; direction: 'input' | 'output' | 'inout' }>>(() => {
    if (!target) return []
    return [
      ...target.interface.inputs.map((variable) => ({ variable, direction: 'input' as const })),
      ...target.interface.outputs.map((variable) => ({ variable, direction: 'output' as const })),
      ...target.interface.inOuts.map((variable) => ({ variable, direction: 'inout' as const })),
    ]
  }, [target])

  const reset = () => {
    setBindingText({})
    setInstanceChoice('')
    setError('')
  }

  const confirm = () => {
    if (!target) {
      setError('请选择要调用的块。')
      return
    }
    const bindings: Record<string, Operand | undefined> = {}
    for (const { variable, direction } of params) {
      const text = bindingText[variable.name] ?? ''
      if (!text.trim()) {
        if (direction === 'input') {
          // 输入允许留空，编译时给出警告。
          bindings[variable.name] = undefined
          continue
        }
        bindings[variable.name] = undefined
        continue
      }
      const expected = variable.dataType.kind === 'base' ? variable.dataType.type : undefined
      const operand = parseOperandInput(project, text, { blockId, expectedType: expected })
      if (!operand) {
        setError(`无法解析参数 ${variable.name} 的实参：${text}`)
        return
      }
      if (direction === 'output' && operand.kind === 'literal') {
        setError(`输出参数 ${variable.name} 必须连接可写变量。`)
        return
      }
      bindings[variable.name] = operand
    }

    let instanceId: string | undefined
    let instanceRef: Operand | undefined
    if (target.kind === 'FB') {
      if (instanceChoice.startsWith('var:')) {
        instanceRef = { kind: 'local', blockId, varId: instanceChoice.slice(4) }
      } else if (instanceChoice.startsWith('db:')) {
        instanceId = instanceChoice.slice(3)
      } else {
        const db = createInstanceDbFor(project, target)
        addDataBlock(db)
        instanceId = db.id
      }
    }

    insertCall(
      blockId,
      networkId,
      createCall(target.id, instanceId, bindings, instanceRef),
      selectedNodeId ? { nodeId: selectedNodeId, position: 'after' } : undefined,
    )
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      title="插入块调用"
      width={560}
      onClose={() => {
        reset()
        onClose()
      }}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={confirm}>
            插入
          </Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="text-[12px] text-faint">工程中还没有 FC/FB 块。请先在项目树中新增 FC 或 FB。</div>
      ) : (
        <>
          <Field label="调用块">
            <select
              className="field-input"
              value={targetBlockId}
              onChange={(event) => {
                setTargetBlockId(event.target.value)
                setBindingText({})
                setInstanceChoice('')
                setError('')
              }}
            >
              {candidates.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name} ({block.kind})
                </option>
              ))}
            </select>
          </Field>

          {target?.kind === 'FB' && (
            <Field label="实例" hint="可选择全局实例 DB、当前 FB 的多重实例变量，或留空自动新建。">
              <select className="field-input" value={instanceChoice} onChange={(event) => setInstanceChoice(event.target.value)}>
                <option value="">（自动新建实例 DB）</option>
                {instanceDbs.map((db) => (
                  <option key={db.id} value={`db:${db.id}`}>
                    {db.name} (DB{db.number})
                  </option>
                ))}
                {instanceVars.map((variable) => (
                  <option key={variable.id} value={`var:${variable.id}`}>
                    多重实例：{variable.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 text-[11px] font-semibold text-faint">参数连接</div>
            {params.length === 0 && <div className="text-[12px] text-faint">该块没有参数。</div>}
            {params.map(({ variable, direction }) => (
              <Field key={variable.id} label={variable.name} hint={`${direction === 'input' ? '输入' : direction === 'output' ? '输出' : '输入输出'} · ${variable.dataType.kind === 'base' ? variable.dataType.type : '复杂类型'}`}>
                <input
                  className="field-input mono"
                  value={bindingText[variable.name] ?? ''}
                  placeholder={direction === 'output' ? '输出变量，如 Result' : '标签 / 地址 / 字面量'}
                  onChange={(event) => setBindingText((value) => ({ ...value, [variable.name]: event.target.value }))}
                />
              </Field>
            ))}
          </div>

          {error && <div className="mt-2 rounded bg-error/10 px-2 py-1 text-[12px] text-error">{error}</div>}
        </>
      )}
    </Modal>
  )
}
