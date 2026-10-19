import { Plus, Trash2 } from 'lucide-react'
import { Button, Modal, ToolButton } from '@/components/ui'
import { addStructField, makeStructField, removeStructField, setStructFieldType, updateStructField } from '@/domain/typeOps'
import { BASE_DATA_TYPES, type BaseDataType, type DataTypeRef, type UdtDef } from '@/domain/types'

export function StructEditorModal({
  open,
  title,
  type,
  udtOptions,
  onClose,
  onChange,
}: {
  open: boolean
  title: string
  type: DataTypeRef
  udtOptions?: UdtDef[]
  onClose: () => void
  onChange: (next: DataTypeRef) => void
}) {
  const structType = type.kind === 'struct' ? type : { kind: 'struct' as const, fields: [] }
  return (
    <Modal
      open={open}
      title={title}
      width={640}
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>完成</Button>}
    >
      <StructFieldEditor type={structType} path={[]} udtOptions={udtOptions} onChange={onChange} />
    </Modal>
  )
}

/** 递归的结构体字段编辑器；可内嵌在面板中使用，也可放进弹窗。 */
export function StructFieldEditor({
  type,
  path,
  udtOptions,
  onChange,
}: {
  type: DataTypeRef
  path: number[]
  udtOptions?: UdtDef[]
  onChange: (next: DataTypeRef) => void
}) {
  if (type.kind !== 'struct') return null
  return (
    <div className={path.length > 0 ? 'ml-4 border-l-2 border-border pl-3' : ''}>
      {type.fields.map((field, index) => {
        const fieldPath = [...path, index]
        const fieldType = field.dataType
        const kindValue =
          fieldType.kind === 'base'
            ? fieldType.type
            : fieldType.kind === 'array'
              ? 'ARRAY'
              : fieldType.kind === 'udt'
                ? `udt:${fieldType.udtId}`
                : 'STRUCT'
        return (
          <div key={field.id} className="mb-1">
            <div className="flex items-center gap-1">
              <input
                data-testid="struct-field-name"
                className="field-input h-6 w-36"
                value={field.name}
                placeholder="字段名"
                onChange={(event) => onChange(updateStructField(type, fieldPath, { name: event.target.value }))}
              />
              <select
                className="field-input h-6 w-28"
                value={kindValue}
                onChange={(event) => {
                  const value = event.target.value
                  const next: DataTypeRef =
                    value === 'ARRAY'
                      ? { kind: 'array', element: { kind: 'base', type: 'INT' }, length: 10 }
                      : value === 'STRUCT'
                        ? { kind: 'struct', fields: [] }
                        : value.startsWith('udt:')
                          ? { kind: 'udt', udtId: value.slice('udt:'.length) }
                          : { kind: 'base', type: value as BaseDataType }
                  onChange(setStructFieldType(type, fieldPath, next))
                }}
              >
                {BASE_DATA_TYPES.map((base) => (
                  <option key={base} value={base}>
                    {base}
                  </option>
                ))}
                <option value="ARRAY">ARRAY</option>
                <option value="STRUCT">STRUCT</option>
                {(udtOptions ?? []).map((udt) => (
                  <option key={udt.id} value={`udt:${udt.id}`}>
                    {udt.name}
                  </option>
                ))}
              </select>
              {fieldType.kind === 'array' && (
                <>
                  <select
                    className="field-input h-6 w-24"
                    value={
                      fieldType.element.kind === 'base'
                        ? fieldType.element.type
                        : fieldType.element.kind === 'udt'
                          ? `udt:${fieldType.element.udtId}`
                          : 'INT'
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      const element: DataTypeRef = value.startsWith('udt:')
                        ? { kind: 'udt', udtId: value.slice('udt:'.length) }
                        : { kind: 'base', type: value as BaseDataType }
                      onChange(setStructFieldType(type, fieldPath, { kind: 'array', element, length: fieldType.length }))
                    }}
                  >
                    {BASE_DATA_TYPES.map((base) => (
                      <option key={base} value={base}>
                        {base}
                      </option>
                    ))}
                    {(udtOptions ?? []).map((udt) => (
                      <option key={udt.id} value={`udt:${udt.id}`}>
                        {udt.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="field-input h-6 w-16"
                    value={fieldType.length}
                    min={1}
                    onChange={(event) =>
                      onChange(setStructFieldType(type, fieldPath, { kind: 'array', element: fieldType.element, length: Math.max(1, Number(event.target.value)) }))
                    }
                  />
                </>
              )}
              {fieldType.kind === 'udt' && (
                <span className="rounded bg-panel-sunken px-1.5 py-0.5 text-[11px] text-dim">
                  引用 {udtOptions?.find((udt) => udt.id === fieldType.udtId)?.name ?? '缺失的 UDT'}
                </span>
              )}
              <input
                className="field-input h-6 flex-1"
                value={field.comment ?? ''}
                placeholder="注释"
                onChange={(event) => onChange(updateStructField(type, fieldPath, { comment: event.target.value }))}
              />
              <button
                type="button"
                className="rounded p-1 text-faint hover:bg-panel-sunken hover:text-error"
                onClick={() => onChange(removeStructField(type, path, index))}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {fieldType.kind === 'struct' && (
              <StructFieldEditor type={fieldType} path={fieldPath} udtOptions={udtOptions} onChange={onChange} />
            )}
          </div>
        )
      })}
      <div className="mt-1">
        <ToolButton
          label="新增子字段"
          icon={<Plus size={12} />}
          onClick={() => onChange(addStructField(type, path, makeStructField(`Field${type.fields.length + 1}`, { kind: 'base', type: 'INT' })))}
        />
      </div>
    </div>
  )
}
