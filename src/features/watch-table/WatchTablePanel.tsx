import { memo, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { newId } from '@/domain/ids'
import { formatOperand, operandKey } from '@/domain/operand'
import { allTags } from '@/domain/projectIndex'
import type { Operand, Project } from '@/domain/types'
import { useProjectStore } from '@/store/projectStore'
import { useSimulationStore } from '@/store/simulationStore'
import { simClient } from '@/workers/simClient'
import { ToolButton } from '@/components/ui'
import { Cell, VirtualTable } from '@/components/VirtualTable'

export function WatchTablePanel({ project }: { project: Project }) {
  const update = useProjectStore((state) => state.update)
  const mode = useSimulationStore((state) => state.mode)
  const table = project.watchTables[0]
  const [selectedValue, setSelectedValue] = useState<string>('')
  const tags = useMemo(() => allTags(project), [project])

  const addEntry = () => {
    if (!table) return
    let operand: Operand | undefined
    if (selectedValue.startsWith('db:')) {
      const [, dbId, ...path] = selectedValue.split(':')
      operand = { kind: 'dbField', dbId, path }
    } else if (selectedValue.startsWith('tag:')) {
      operand = { kind: 'tag', tagId: selectedValue.slice(4) }
    } else if (tags[0]) {
      operand = { kind: 'tag', tagId: tags[0].id }
    }
    if (!operand) return
    update((draft) => {
      const target = draft.watchTables.find((item) => item.id === table.id)
      target?.entries.push({ id: newId('we'), operand: operand as Operand, format: 'AUTO' })
    }, '添加监视项')
  }

  if (!table) return <div className="p-3 text-faint">没有监视表。</div>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-panel-alt px-2 py-1">
        <select className="field-input h-6 flex-1" value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)}>
          <option value="">选择变量…</option>
          <optgroup label="PLC 变量">
            {tags.map((tag) => (
              <option key={tag.id} value={`tag:${tag.id}`}>
                {tag.name}
              </option>
            ))}
          </optgroup>
          {project.dataBlocks.map((db) => (
            <optgroup key={db.id} label={`${db.name} (DB${db.number})`}>
              {db.fields.map((field) => (
                <option key={field.id} value={`db:${db.id}:${field.name}`}>
                  {field.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ToolButton label="添加" icon={<Plus size={13} />} onClick={addEntry} />
        <span className="text-[11px] text-faint">{mode === 'running' ? '在线' : '离线'}</span>
      </div>
      <VirtualTable
        columns={[
          { key: 'operand', label: '操作数', width: '1fr' },
          { key: 'value', label: '当前值', width: '120px' },
          { key: 'modify', label: '修改值', width: '110px' },
          { key: 'action', label: '操作', width: '90px' },
        ]}
        items={table.entries}
        getKey={(entry) => entry.id}
        renderCells={(entry) => <WatchRowCells project={project} entryId={entry.id} operand={entry.operand} />}
        empty={<div className="px-3 py-6 text-center text-[12px] text-faint">监视表为空，请从上方选择变量后添加。</div>}
      />
    </div>
  )
}

const WatchRowCells = memo(function WatchRowCells({
  project,
  entryId,
  operand,
}: {
  project: Project
  entryId: string
  operand: Operand
}) {
  const update = useProjectStore((state) => state.update)
  const [modify, setModify] = useState('')
  // 行级订阅：整表不再随每个扫描周期重渲染。
  const key = operandKey(operand)
  const value = useSimulationStore((state) => state.values[key])
  const display = value === undefined ? '—' : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value)

  const remove = () => {
    update((draft) => {
      for (const table of draft.watchTables) {
        table.entries = table.entries.filter((entry) => entry.id !== entryId)
      }
    }, '删除监视项')
  }

  const write = () => {
    if (!modify.trim()) return
    const numeric = Number(modify)
    const payload: boolean | number = modify.toUpperCase() === 'TRUE' ? true : modify.toUpperCase() === 'FALSE' ? false : Number.isFinite(numeric) ? numeric : 0
    simClient.write(operand, payload)
    setModify('')
  }

  return (
    <>
      <Cell className="mono">{formatOperand(project, operand)}</Cell>
      <Cell className="mono text-accent">{display}</Cell>
      <Cell>
        <input
          className="field-input mono h-6"
          value={modify}
          placeholder="值"
          onChange={(event) => setModify(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') write()
          }}
        />
      </Cell>
      <Cell className="text-center">
        <button type="button" className="rounded px-1 text-[11px] text-accent hover:bg-panel-sunken" onClick={write}>
          写入
        </button>
        <button type="button" className="ml-1 rounded p-1 text-faint hover:text-error" onClick={remove}>
          <Trash2 size={12} />
        </button>
      </Cell>
    </>
  )
})
