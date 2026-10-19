import { Plus, Trash2 } from 'lucide-react'
import { nextFreeAddress } from '@/domain/allocate'
import { createTag } from '@/domain/project'
import { BASE_DATA_TYPES, type BaseDataType, type DataTypeRef, type Project, type Tag } from '@/domain/types'
import { addTag, deleteTag, updateTag } from '@/store/editorActions'
import { TextInput } from '@/components/TextInput'
import { ToolButton } from '@/components/ui'

export function TagTablePanel({ project }: { project: Project }) {
  const table = project.tagTables[0]
  if (!table) return <div className="p-3 text-dim">没有变量表。</div>

  const handleAdd = () => {
    const index = table.tags.length + 1
    const address = nextFreeAddress(project, 'M', 'BOOL')
    addTag(table.id, createTag(`Tag${index}`, address, { kind: 'base', type: 'BOOL' }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-panel-alt px-2 py-1">
        <span className="text-[12px] font-semibold">{table.name}</span>
        <ToolButton label="新增变量" icon={<Plus size={13} />} onClick={handleAdd} />
        <span className="text-[11px] text-faint">共 {table.tags.length} 个变量</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-panel-alt text-left text-dim">
            <tr>
              <th className="border-b border-border px-2 py-1 font-medium">名称</th>
              <th className="border-b border-border px-2 py-1 font-medium">数据类型</th>
              <th className="border-b border-border px-2 py-1 font-medium">地址</th>
              <th className="border-b border-border px-2 py-1 font-medium">注释</th>
              <th className="border-b border-border px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {table.tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} />
            ))}
            {table.tags.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-faint">
                  还没有变量。点击“新增变量”开始。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TagRow({ tag }: { tag: Tag }) {
  const base = tag.dataType.kind === 'base' ? tag.dataType.type : 'BYTE'
  const update = (patch: Partial<Tag>) => updateTag(tag.id, patch)
  return (
    <tr className="hover:bg-panel-alt">
      <td className="border-b border-border px-1 py-0.5">
        <TextInput className="field-input" value={tag.name} onCommit={(value) => update({ name: value })} />
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <select
          className="field-input"
          value={base}
          onChange={(event) => update({ dataType: { kind: 'base', type: event.target.value as BaseDataType } as DataTypeRef })}
        >
          {BASE_DATA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <input
          className="field-input mono"
          value={tag.address ?? ''}
          placeholder="%I0.0"
          onChange={(event) => update({ address: event.target.value })}
        />
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <TextInput className="field-input" value={tag.comment ?? ''} onCommit={(value) => update({ comment: value })} />
      </td>
      <td className="border-b border-border px-1 py-0.5 text-center">
        <button type="button" className="rounded p-1 text-faint hover:bg-panel-sunken hover:text-error" onClick={() => deleteTag(tag.id)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}
