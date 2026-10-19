import { Plus, Trash2 } from 'lucide-react'
import { createUdt, nextUdtName } from '@/domain/project'
import { collectUdtRefs } from '@/domain/userTypes'
import type { DataTypeRef, Project, UdtDef } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'
import { addUserType, deleteUserType, updateUdtFields, updateUserType } from '@/store/editorActions'
import { TextInput } from '@/components/TextInput'
import { ToolButton } from '@/components/ui'
import { confirmAction, notify } from '@/store/notificationStore'
import { StructFieldEditor } from '@/features/data-blocks/StructEditorModal'

export function UdtPanel({ project }: { project: Project }) {
  const activeUdtId = useUiStore((state) => state.activeUdtId)
  const setActiveUdt = useUiStore((state) => state.setActiveUdt)
  const udt = project.userTypes.find((item) => item.id === activeUdtId) ?? project.userTypes[0]

  const handleAdd = () => {
    const next = createUdt(nextUdtName(project))
    addUserType(next)
    setActiveUdt(next.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-panel-alt px-2 py-1">
        <span className="text-[12px] font-semibold">PLC 数据类型</span>
        <select className="field-input h-6 w-52" value={udt?.id ?? ''} onChange={(event) => setActiveUdt(event.target.value || undefined)}>
          <option value="">选择数据类型…</option>
          {project.userTypes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <ToolButton label="新建数据类型" icon={<Plus size={13} />} onClick={handleAdd} />
        {udt && (
          <>
            <TextInput
              data-testid="udt-name"
              className="field-input h-6 w-40"
              value={udt.name}
              onCommit={(value) => updateUserType(udt.id, { name: value })}
            />
            <TextInput
              className="field-input h-6 w-48"
              value={udt.comment ?? ''}
              placeholder="注释"
              onCommit={(value) => updateUserType(udt.id, { comment: value })}
            />
            <span className="text-[11px] text-faint">{usageLabel(project, udt)}</span>
            <ToolButton
              label="删除数据类型"
              icon={<Trash2 size={13} />}
              onClick={() => {
                void (async () => {
                  const ok = await confirmAction(
                    `确定删除 PLC 数据类型「${udt.name}」吗？引用它的数据块字段与块接口变量会变成“数据类型不存在”错误。`,
                    { title: '删除数据类型', confirmLabel: '删除', danger: true },
                  )
                  if (!ok) return
                  deleteUserType(udt.id)
                  setActiveUdt(undefined)
                  notify(`已删除数据类型「${udt.name}」。`, 'success')
                })()
              }}
            />
          </>
        )}
      </div>

      {!udt ? (
        <div className="p-4 text-[12px] text-faint">
          还没有 PLC 数据类型。UDT 可以在数据块字段和块接口中按名称复用，修改定义后所有引用处同步生效。
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-1 text-[11px] text-dim">
            字段（可在其它 UDT、数据块字段或块接口变量中按 <span className="mono">{udt.name}</span> 引用）
          </div>
          <div className="rounded border border-border p-2">
            <StructFieldEditor
              type={{ kind: 'struct', fields: udt.fields }}
              path={[]}
              udtOptions={project.userTypes.filter((item) => item.id !== udt.id)}
              onChange={(next: DataTypeRef) => {
                if (next.kind === 'struct') updateUdtFields(udt.id, next.fields)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** 统计该 UDT 被引用的情况（其它 UDT、数据块字段、块接口）。 */
function usageLabel(project: Project, udt: UdtDef): string {
  let count = 0
  for (const other of project.userTypes) {
    if (other.id === udt.id) continue
    if (collectUdtRefs({ kind: 'struct', fields: other.fields }).has(udt.id)) count += 1
  }
  for (const db of project.dataBlocks) {
    for (const field of db.fields) if (collectUdtRefs(field.dataType).has(udt.id)) count += 1
  }
  for (const block of project.blocks) {
    const decls = [
      ...block.interface.inputs,
      ...block.interface.outputs,
      ...block.interface.inOuts,
      ...block.interface.statics,
      ...block.interface.temps,
    ]
    for (const decl of decls) if (collectUdtRefs(decl.dataType).has(udt.id)) count += 1
  }
  return count > 0 ? `被引用 ${count} 处` : '未被引用'
}
