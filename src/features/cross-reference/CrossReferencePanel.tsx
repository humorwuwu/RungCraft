import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { buildCrossReferences, type CrossReferenceEntry } from '@/domain/crossReference'
import { formatOperand } from '@/domain/operand'
import type { Project } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'

export function CrossReferencePanel({ project }: { project: Project }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const setActiveBlock = useUiStore((state) => state.setActiveBlock)
  const setActiveNetwork = useUiStore((state) => state.setActiveNetwork)
  const selectNode = useUiStore((state) => state.selectNode)
  const setCenterView = useUiStore((state) => state.setCenterView)

  const entries = useMemo(() => buildCrossReferences(project), [project])
  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase()
    if (!lower) return entries
    return entries.filter((entry) => formatOperand(project, entry.operand).toLowerCase().includes(lower))
  }, [entries, project, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 border-b border-border p-1.5">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className="field-input pl-6" placeholder="搜索变量/地址…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {filtered.map((entry) => (
          <EntryRow
            key={entry.key}
            project={project}
            entry={entry}
            expanded={Boolean(expanded[entry.key])}
            onToggle={() => setExpanded((value) => ({ ...value, [entry.key]: !value[entry.key] }))}
            onNavigate={(usage) => {
              setActiveBlock(usage.blockId, usage.networkId)
              setActiveNetwork(usage.networkId)
              selectNode(usage.nodeId)
              setCenterView('ladder')
            }}
          />
        ))}
        {filtered.length === 0 && <div className="p-3 text-center text-[12px] text-faint">没有匹配的引用。</div>}
      </div>
    </div>
  )
}

function EntryRow({
  project,
  entry,
  expanded,
  onToggle,
  onNavigate,
}: {
  project: Project
  entry: CrossReferenceEntry
  expanded: boolean
  onToggle: () => void
  onNavigate: (usage: CrossReferenceEntry['usages'][number]) => void
}) {
  return (
    <div className="mb-0.5 rounded border border-border">
      <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-left hover:bg-panel-alt" onClick={onToggle}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="mono flex-1 truncate">{formatOperand(project, entry.operand)}</span>
        <span className="rounded bg-panel-sunken px-1.5 text-[11px] text-dim">{entry.usages.length} 处</span>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {entry.usages.map((usage, index) => (
            <button
              key={`${usage.nodeId}_${index}`}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-0.5 text-left text-[11px] hover:bg-accent-soft"
              onClick={() => onNavigate(usage)}
            >
              <span className="text-dim">{usage.blockName}</span>
              <span className="truncate">网络 {usage.networkTitle || '—'}</span>
              <span className="ml-auto text-faint">{usage.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
