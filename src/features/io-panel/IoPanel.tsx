import { memo, useMemo, useState } from 'react'
import { parseAddress } from '@/domain/address'
import { operandKey } from '@/domain/operand'
import { allTags } from '@/domain/projectIndex'
import type { Operand, Project, Tag } from '@/domain/types'
import { useSimulationStore } from '@/store/simulationStore'
import { simClient } from '@/workers/simClient'
import { Cell, VirtualTable } from '@/components/VirtualTable'

export function IoPanel({ project }: { project: Project }) {
  // I/Q 列表只依赖工程，缓存起来避免每个扫描周期重算。
  const io = useMemo(
    () =>
      allTags(project)
        .map((tag) => ({ tag, parsed: tag.address ? parseAddress(tag.address) : undefined }))
        .filter((item) => item.parsed && (item.parsed.area === 'I' || item.parsed.area === 'Q')),
    [project],
  )

  if (io.length === 0) {
    return <div className="p-3 text-[12px] text-faint">没有 I/Q 变量。请先在变量表中添加带 %I/%Q 地址的变量。</div>
  }

  return (
    <VirtualTable
      columns={[
        { key: 'address', label: '地址', width: '90px' },
        { key: 'name', label: '名称', width: '1fr' },
        { key: 'value', label: '值', width: '80px' },
        { key: 'action', label: '操作', width: '140px' },
        { key: 'force', label: '强制', width: '90px' },
      ]}
      items={io}
      getKey={(item) => item.tag.id}
      renderCells={({ tag }) => <IoRowCells tag={tag} />}
    />
  )
}

const IoRowCells = memo(function IoRowCells({ tag }: { tag: Tag }) {
  const [input, setInput] = useState('')
  const operand: Operand = { kind: 'tag', tagId: tag.id }
  const key = operandKey(operand)
  // 行级订阅：只有这一行的值/强制状态变化时才重渲染。
  const value = useSimulationStore((state) => state.values[key])
  const forced = useSimulationStore((state) => state.forces.some((force) => force.key === key))
  const isBool = tag.dataType.kind === 'base' && tag.dataType.type === 'BOOL'
  const current = isBool ? (value ? 'TRUE' : 'FALSE') : value === undefined ? '—' : String(value)

  return (
    <>
      <Cell className="mono">{tag.address}</Cell>
      <Cell>
        <span>{tag.name}</span>
        {tag.comment && <span className="ml-2 text-[11px] text-faint">{tag.comment}</span>}
      </Cell>
      <Cell className={`mono ${value ? 'text-power' : 'text-dim'}`}>{current}</Cell>
      <Cell>
        {isBool ? (
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-[11px] hover:border-accent"
            onClick={() => simClient.write(operand, !value)}
          >
            翻转
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <input
              className="field-input mono h-6 w-20"
              value={input}
              placeholder="值"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && input.trim()) {
                  simClient.write(operand, Number(input))
                  setInput('')
                }
              }}
            />
            <button
              type="button"
              className="whitespace-nowrap rounded border border-border px-1 py-0.5 text-[11px] hover:border-accent"
              onClick={() => {
                if (input.trim()) {
                  simClient.write(operand, Number(input))
                  setInput('')
                }
              }}
            >
              写入
            </button>
          </span>
        )}
      </Cell>
      <Cell>
        <label className="flex items-center gap-1 text-[11px]">
          <input
            type="checkbox"
            checked={forced}
            onChange={(event) => {
              if (event.target.checked) {
                simClient.force({ key, operand, value: isBool ? Boolean(value) : Number(value ?? 0) })
              } else {
                simClient.releaseForce([key])
              }
            }}
          />
          {forced ? <span className="text-warn">强制中</span> : <span className="text-faint">强制</span>}
        </label>
      </Cell>
    </>
  )
})
