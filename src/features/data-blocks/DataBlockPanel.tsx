import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createDataBlock, createVarDecl, nextDbNumber } from '@/domain/project'
import { BASE_DATA_TYPES, type BaseDataType, type DataTypeRef, type Project, type UdtDef, type VarDecl } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'
import {
  addDataBlock,
  addDbField,
  deleteDataBlock,
  deleteDbField,
  updateDataBlock,
  updateDbField,
} from '@/store/editorActions'
import { TextInput } from '@/components/TextInput'
import { ToolButton } from '@/components/ui'
import { confirmAction, notify } from '@/store/notificationStore'
import { StructEditorModal } from './StructEditorModal'

export function DataBlockPanel({ project }: { project: Project }) {
  const activeDbId = useUiStore((state) => state.activeDbId)
  const setActiveDb = useUiStore((state) => state.setActiveDb)
  const db = project.dataBlocks.find((item) => item.id === activeDbId) ?? project.dataBlocks[0]

  const handleAddDb = () => {
    const number = nextDbNumber(project)
    const next = createDataBlock(`DataBlock_${number}`, number)
    addDataBlock(next)
    setActiveDb(next.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-panel-alt px-2 py-1">
        <span className="text-[12px] font-semibold">数据块</span>
        <select className="field-input h-6 w-52" value={db?.id ?? ''} onChange={(event) => setActiveDb(event.target.value || undefined)}>
          <option value="">选择数据块…</option>
          {project.dataBlocks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (DB{item.number})
            </option>
          ))}
        </select>
        <ToolButton label="新建数据块" icon={<Plus size={13} />} onClick={handleAddDb} />
        {db && (
          <>
            <TextInput className="field-input h-6 w-40" value={db.name} onCommit={(value) => updateDataBlock(db.id, { name: value })} />
            <label className="flex items-center gap-1 text-[11px] text-dim">
              DB 号
              <input
                type="number"
                className="field-input h-6 w-16"
                value={db.number}
                onChange={(event) => updateDataBlock(db.id, { number: Number(event.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-dim">
              <input type="checkbox" checked={db.retentive ?? false} onChange={(event) => updateDataBlock(db.id, { retentive: event.target.checked })} />
              保持
            </label>
            <ToolButton
              label="删除数据块"
              icon={<Trash2 size={13} />}
              onClick={() => {
                void (async () => {
                  const ok = await confirmAction(`确定删除数据块「${db.name}」(DB${db.number}) 吗？其中的 ${db.fields.length} 个字段会一并删除。`, {
                    title: '删除数据块',
                    confirmLabel: '删除',
                    danger: true,
                  })
                  if (!ok) return
                  deleteDataBlock(db.id)
                  notify(`已删除数据块「${db.name}」。`, 'success')
                })()
              }}
            />
          </>
        )}
      </div>

      {!db ? (
        <div className="p-4 text-[12px] text-faint">还没有数据块。点击“新建数据块”创建一个。</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1">
            {db.kind === 'instance' ? (
              <span className="text-[11px] text-faint">实例 DB 的字段由所属 FB 接口生成，不可在此编辑。</span>
            ) : (
              <ToolButton
                label="新增字段"
                icon={<Plus size={13} />}
                onClick={() => addDbField(db.id, createVarDecl(`Field${db.fields.length + 1}`, { kind: 'base', type: 'INT' }))}
              />
            )}
            <span className="text-[11px] text-faint">共 {db.fields.length} 个字段</span>
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-panel-alt text-left text-dim">
              <tr>
                <th className="border-b border-border px-2 py-1 font-medium">名称</th>
                <th className="border-b border-border px-2 py-1 font-medium">类型</th>
                <th className="border-b border-border px-2 py-1 font-medium">初始值</th>
                <th className="border-b border-border px-2 py-1 font-medium">注释</th>
                <th className="border-b border-border px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {db.fields.map((field) => (
                <DbFieldRow key={field.id} dbId={db.id} field={field} readOnly={db.kind === 'instance'} udtOptions={project.userTypes} />
              ))}
              {db.fields.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-faint">
                    数据块为空。新增字段后即可在梯形图中用 <span className="mono">&quot;{db.name}&quot;.字段</span> 访问。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DbFieldRow({ dbId, field, readOnly, udtOptions }: { dbId: string; field: VarDecl; readOnly?: boolean; udtOptions: UdtDef[] }) {
  const [structOpen, setStructOpen] = useState(false)
  const setActiveUdt = useUiStore((state) => state.setActiveUdt)
  const kind = field.dataType.kind
  const base = field.dataType.kind === 'base' ? field.dataType.type : field.dataType.kind === 'array' && field.dataType.element.kind === 'base' ? field.dataType.element.type : 'INT'
  const arrayLength = field.dataType.kind === 'array' ? field.dataType.length : 0
  const kindValue =
    kind === 'udt' && field.dataType.kind === 'udt' ? `udt:${field.dataType.udtId}` : kind === 'array' ? 'ARRAY' : kind === 'struct' ? 'STRUCT' : base

  const setKind = (nextKind: string) => {
    if (nextKind === 'ARRAY') {
      updateDbField(dbId, field.id, { dataType: { kind: 'array', element: { kind: 'base', type: base as BaseDataType }, length: Math.max(1, arrayLength || 10) } })
    } else if (nextKind === 'STRUCT') {
      updateDbField(dbId, field.id, { dataType: { kind: 'struct', fields: [] } })
    } else if (nextKind.startsWith('udt:')) {
      updateDbField(dbId, field.id, { dataType: { kind: 'udt', udtId: nextKind.slice('udt:'.length) } })
    } else {
      updateDbField(dbId, field.id, { dataType: { kind: 'base', type: nextKind as BaseDataType } })
    }
  }

  if (readOnly) {
    return (
      <tr className="hover:bg-panel-alt">
        <td className="mono border-b border-border px-2 py-0.5">{field.name}</td>
        <td className="border-b border-border px-2 py-0.5 text-dim">
          {kind === 'array' ? `ARRAY[${arrayLength}]` : kind === 'struct' ? 'STRUCT' : kind === 'udt' ? udtLabel(udtOptions, field) : base}
        </td>
        <td className="border-b border-border px-2 py-0.5" />
        <td className="border-b border-border px-2 py-0.5 text-faint">{field.comment ?? ''}</td>
        <td className="border-b border-border px-2 py-0.5" />
      </tr>
    )
  }

  return (
    <tr className="hover:bg-panel-alt">
      <td className="border-b border-border px-1 py-0.5">
        <TextInput
          data-testid="db-field-name"
          className="field-input"
          value={field.name}
          onCommit={(value) => updateDbField(dbId, field.id, { name: value })}
        />
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <div className="flex items-center gap-1">
          <select
            className="field-input h-6 w-24"
            value={kindValue}
            onChange={(event) => setKind(event.target.value)}
          >
            {BASE_DATA_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option value="ARRAY">ARRAY</option>
            <option value="STRUCT">STRUCT</option>
            {udtOptions.map((udt) => (
              <option key={udt.id} value={`udt:${udt.id}`}>
                {udt.name}
              </option>
            ))}
          </select>
          {kind === 'udt' && field.dataType.kind === 'udt' && (
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-[11px] hover:border-accent"
              title="打开 PLC 数据类型编辑器"
              onClick={() => setActiveUdt(field.dataType.kind === 'udt' ? field.dataType.udtId : undefined)}
            >
              编辑类型 {udtLabel(udtOptions, field)}
            </button>
          )}
          {kind === 'struct' && (
            <>
              <button type="button" className="rounded border border-border px-2 py-0.5 text-[11px] hover:border-accent" onClick={() => setStructOpen(true)}>
                编辑结构 ({field.dataType.kind === 'struct' ? field.dataType.fields.length : 0})
              </button>
              <StructEditorModal
                open={structOpen}
                title={`编辑结构：${field.name}`}
                type={field.dataType}
                udtOptions={udtOptions}
                onClose={() => setStructOpen(false)}
                onChange={(next) => updateDbField(dbId, field.id, { dataType: next })}
              />
            </>
          )}
          {kind === 'array' && field.dataType.kind === 'array' && (
            <>
              <select
                className="field-input h-6 w-20"
                value={
                  field.dataType.element.kind === 'struct'
                    ? 'STRUCT'
                    : field.dataType.element.kind === 'udt'
                      ? `udt:${field.dataType.element.udtId}`
                      : base
                }
                onChange={(event) => {
                  const value = event.target.value
                  const element: DataTypeRef =
                    value === 'STRUCT'
                      ? { kind: 'struct', fields: [] }
                      : value.startsWith('udt:')
                        ? { kind: 'udt', udtId: value.slice('udt:'.length) }
                        : { kind: 'base', type: value as BaseDataType }
                  updateDbField(dbId, field.id, { dataType: { kind: 'array', element, length: Math.max(1, arrayLength) } })
                }}
              >
                {BASE_DATA_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
                <option value="STRUCT">STRUCT</option>
                {udtOptions.map((udt) => (
                  <option key={udt.id} value={`udt:${udt.id}`}>
                    {udt.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                className="field-input h-6 w-16"
                value={arrayLength}
                min={1}
                onChange={(event) =>
                  updateDbField(dbId, field.id, {
                    dataType: { kind: 'array', element: field.dataType.kind === 'array' ? field.dataType.element : { kind: 'base', type: 'INT' }, length: Math.max(1, Number(event.target.value)) },
                  })
                }
              />
              {field.dataType.element.kind === 'struct' && (
                <>
                  <button type="button" className="rounded border border-border px-2 py-0.5 text-[11px] hover:border-accent" onClick={() => setStructOpen(true)}>
                    编辑元素结构
                  </button>
                  <StructEditorModal
                    open={structOpen}
                    title={`编辑数组元素结构：${field.name}`}
                    type={field.dataType.element}
                    udtOptions={udtOptions}
                    onClose={() => setStructOpen(false)}
                    onChange={(next) =>
                      updateDbField(dbId, field.id, {
                        dataType: { kind: 'array', element: next, length: Math.max(1, arrayLength) },
                      })
                    }
                  />
                </>
              )}
            </>
          )}
        </div>
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <input
          className="field-input mono"
          value={field.initialValue === undefined ? '' : String(field.initialValue)}
          placeholder="0"
          onChange={(event) => updateDbField(dbId, field.id, { initialValue: event.target.value })}
        />
      </td>
      <td className="border-b border-border px-1 py-0.5">
        <TextInput className="field-input" value={field.comment ?? ''} onCommit={(value) => updateDbField(dbId, field.id, { comment: value })} />
      </td>
      <td className="border-b border-border px-1 py-0.5 text-center">
        <button type="button" className="rounded p-1 text-faint hover:bg-panel-sunken hover:text-error" onClick={() => deleteDbField(dbId, field.id)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

function udtLabel(udtOptions: UdtDef[], field: VarDecl): string {
  const type = field.dataType
  if (type.kind !== 'udt') return '?'
  return udtOptions.find((udt) => udt.id === type.udtId)?.name ?? '缺失的 UDT'
}
