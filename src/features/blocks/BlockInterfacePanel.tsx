import { Plus, Trash2 } from 'lucide-react'
import { createVarDecl } from '@/domain/project'
import { BASE_DATA_TYPES, type BaseDataType, type BlockInterface, type ProgramBlock, type Project, type UdtDef, type VarDecl } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'
import { addInterfaceVar, deleteInterfaceVar, updateInterfaceVar, updateProgramBlock } from '@/store/editorActions'
import { TextInput } from '@/components/TextInput'
import { ToolButton } from '@/components/ui'

type GroupKey = 'inputs' | 'outputs' | 'inOuts' | 'statics' | 'temps'

const GROUPS: Array<{ key: GroupKey; label: string; fbOnly?: boolean }> = [
  { key: 'inputs', label: '输入 (Input)' },
  { key: 'outputs', label: '输出 (Output)' },
  { key: 'inOuts', label: '输入输出 (InOut)' },
  { key: 'statics', label: '静态 (Static)', fbOnly: true },
  { key: 'temps', label: '临时 (Temp)' },
]

export function BlockInterfacePanel({ project }: { project: Project }) {
  const blockId = useUiStore((state) => state.activeBlockId) ?? project.blocks[0]?.id
  const block = project.blocks.find((item) => item.id === blockId)
  if (!block) return <div className="p-3 text-faint">没有程序块。</div>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-panel-alt px-2 py-1">
        <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">{block.kind}</span>
        <TextInput className="field-input h-6 w-40" value={block.name} onCommit={(value) => updateProgramBlock(block.id, { name: value })} />
        <label className="flex items-center gap-1 text-[11px] text-dim">
          编号
          <input
            type="number"
            className="field-input h-6 w-16"
            value={block.number}
            onChange={(event) => updateProgramBlock(block.id, { number: Number(event.target.value) })}
          />
        </label>
        <span className="text-[11px] text-faint">调用帧 {block.kind === 'FB' ? '静态变量存于实例 DB，临时变量在帧内' : '参数与临时变量在调用帧内'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {GROUPS.filter((group) => !group.fbOnly || block.kind === 'FB').map((group) => (
          <InterfaceGroup
            key={group.key}
            block={block}
            groupKey={group.key}
            label={group.label}
            instanceOptions={project.blocks.filter((item) => item.kind === 'FB' && item.id !== block.id)}
            udtOptions={project.userTypes}
          />
        ))}
      </div>
    </div>
  )
}

function InterfaceGroup({
  block,
  groupKey,
  label,
  instanceOptions,
  udtOptions,
}: {
  block: ProgramBlock
  groupKey: GroupKey
  label: string
  instanceOptions: ProgramBlock[]
  udtOptions: UdtDef[]
}) {
  const variables = block.interface[groupKey] as VarDecl[]
  return (
    <div className="mb-3 rounded border border-border">
      <div className="flex items-center justify-between border-b border-border bg-panel-alt px-2 py-1 text-[12px] font-semibold text-dim">
        <span>{label}</span>
        <ToolButton
          label="新增"
          icon={<Plus size={12} />}
          onClick={() => addInterfaceVar(block.id, groupKey as keyof BlockInterface, createVarDecl(`Var${variables.length + 1}`, { kind: 'base', type: 'BOOL' }))}
        />
      </div>
      <table className="w-full border-collapse text-[12px]">
        <tbody>
          {variables.map((variable) => (
            <tr key={variable.id} className="hover:bg-panel-alt">
              <td className="w-40 border-b border-border px-1 py-0.5">
                <TextInput
                  data-testid="interface-var-name"
                  className="field-input"
                  value={variable.name}
                  onCommit={(value) => updateInterfaceVar(block.id, groupKey as keyof BlockInterface, variable.id, { name: value })}
                />
              </td>
              <td className="w-28 border-b border-border px-1 py-0.5">
                <select
                  className="field-input"
                  value={
                    variable.dataType.kind === 'base'
                      ? variable.dataType.type
                      : variable.dataType.kind === 'instance'
                        ? `instance:${variable.dataType.blockId}`
                        : variable.dataType.kind === 'udt'
                          ? `udt:${variable.dataType.udtId}`
                          : 'BOOL'
                  }
                  onChange={(event) => {
                    const value = event.target.value
                    const dataType: VarDecl['dataType'] = value.startsWith('instance:')
                      ? { kind: 'instance', blockId: value.slice('instance:'.length) }
                      : value.startsWith('udt:')
                        ? { kind: 'udt', udtId: value.slice('udt:'.length) }
                        : { kind: 'base', type: value as BaseDataType }
                    updateInterfaceVar(block.id, groupKey as keyof BlockInterface, variable.id, { dataType })
                  }}
                >
                  {BASE_DATA_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  {groupKey === 'statics' &&
                    instanceOptions.map((fb) => (
                      <option key={fb.id} value={`instance:${fb.id}`}>
                        {fb.name} 实例
                      </option>
                    ))}
                  {udtOptions.map((udt) => (
                    <option key={udt.id} value={`udt:${udt.id}`}>
                      {udt.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="border-b border-border px-1 py-0.5">
                <TextInput
                  className="field-input"
                  value={variable.comment ?? ''}
                  placeholder="注释"
                  onCommit={(value) => updateInterfaceVar(block.id, groupKey as keyof BlockInterface, variable.id, { comment: value })}
                />
              </td>
              <td className="w-8 border-b border-border px-1 py-0.5 text-center">
                <button
                  type="button"
                  className="rounded p-1 text-faint hover:bg-panel-sunken hover:text-error"
                  onClick={() => deleteInterfaceVar(block.id, groupKey as keyof BlockInterface, variable.id)}
                >
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
          {variables.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-2 text-[11px] text-faint">
                暂无变量
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
