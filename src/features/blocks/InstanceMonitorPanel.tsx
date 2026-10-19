import { memo, useMemo } from 'react'
import { collectFieldPaths } from '@/domain/typeOps'
import { typeExpanderFor } from '@/domain/userTypes'
import { formatOperand, operandKey } from '@/domain/operand'
import { resolveTypePath } from '@/domain/projectIndex'
import type { DataTypeRef, Operand, Project } from '@/domain/types'
import { formatTime } from '@/domain/values'
import { useSimulationStore } from '@/store/simulationStore'
import { useUiStore } from '@/store/uiStore'
import { Cell, VirtualTable } from '@/components/VirtualTable'

interface InstanceRow {
  key: string
  dbName: string
  operand: Operand
  type: DataTypeRef | undefined
}

export function InstanceMonitorPanel({ project }: { project: Project }) {
  const activeBlockId = useUiStore((state) => state.activeBlockId)
  const mode = useSimulationStore((state) => state.mode)

  const dbs = useMemo(
    () => project.dataBlocks.filter((db) => db.kind === 'instance' && (!activeBlockId || db.instanceOf === activeBlockId)),
    [project.dataBlocks, activeBlockId],
  )

  // 所有实例 DB 的字段摊平成一张表，便于窗口化与快速浏览。
  const rows = useMemo(() => {
    const expand = typeExpanderFor(project)
    return dbs.flatMap<InstanceRow>((db) =>
      db.fields.flatMap((field) =>
        collectFieldPaths(field.dataType, [field.name], 0, expand).map((path) => {
          const operand: Operand = { kind: 'dbField', dbId: db.id, path }
          return {
            key: `${db.id}:${path.join('.')}`,
            dbName: `${db.name} (DB${db.number})`,
            operand,
            type: resolveTypePath({ kind: 'struct', fields: db.fields }, path, expand),
          }
        }),
      ),
    )
  }, [dbs, project])

  if (dbs.length === 0) {
    return <div className="p-3 text-[12px] text-faint">当前块没有实例数据块。先插入一个 FB 调用，或选中包含 FB 调用的块。</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-panel-alt px-2 py-1 text-[11px] text-dim">
        实例监视 · {mode === 'running' ? '在线' : '离线'} · {dbs.length} 个实例 · {rows.length} 个字段
      </div>
      <VirtualTable
        columns={[
          { key: 'db', label: '实例数据块', width: '190px' },
          { key: 'field', label: '字段', width: '1fr' },
          { key: 'type', label: '类型', width: '110px' },
          { key: 'value', label: '当前值', width: '120px' },
        ]}
        items={rows}
        getKey={(row) => row.key}
        renderCells={(row) => <InstanceRowCells project={project} row={row} />}
        empty={<div className="px-3 py-6 text-center text-[12px] text-faint">实例 DB 没有字段。</div>}
      />
    </div>
  )
}

const InstanceRowCells = memo(function InstanceRowCells({ project, row }: { project: Project; row: InstanceRow }) {
  // 行级订阅：只有这一行的值变化时才重渲染。
  const value = useSimulationStore((state) => state.values[operandKey(row.operand)])
  return (
    <>
      <Cell className="text-dim">{row.dbName}</Cell>
      <Cell className="mono">{formatOperand(project, row.operand)}</Cell>
      <Cell className="text-dim">{typeLabel(row.type)}</Cell>
      <Cell className="mono text-accent">{formatValue(value, row.type)}</Cell>
    </>
  )
})

function typeLabel(type: DataTypeRef | undefined): string {
  if (!type) return '?'
  if (type.kind === 'base') return type.type
  if (type.kind === 'array') return `ARRAY[${type.length}]`
  if (type.kind === 'struct') return 'STRUCT'
  if (type.kind === 'udt') return 'UDT'
  return 'FB 实例'
}

function formatValue(value: boolean | number | undefined, type: DataTypeRef | undefined): string {
  if (value === undefined) return '—'
  if (type?.kind === 'base' && type.type === 'BOOL') return value ? 'TRUE' : 'FALSE'
  if (type?.kind === 'base' && type.type === 'TIME') return formatTime(Number(value))
  if (typeof value === 'number' && type?.kind === 'base' && type.type === 'REAL') return value.toFixed(3)
  return String(value)
}
