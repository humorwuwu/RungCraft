import { useMemo, useState } from 'react'
import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { Diagnostic } from '@/compiler/ir'
import { useSimulationStore } from '@/store/simulationStore'
import { useUiStore } from '@/store/uiStore'
import { revealNode } from '@/features/ladder/reveal'

type Filter = 'all' | 'error' | 'warning'

export function ProblemsPanel() {
  const diagnostics = useSimulationStore((state) => state.diagnostics)
  const setActiveBlock = useUiStore((state) => state.setActiveBlock)
  const setActiveNetwork = useUiStore((state) => state.setActiveNetwork)
  const selectNode = useUiStore((state) => state.selectNode)
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      error: diagnostics.filter((item) => item.severity === 'error').length,
      warning: diagnostics.filter((item) => item.severity === 'warning').length,
      info: diagnostics.filter((item) => item.severity === 'info').length,
    }),
    [diagnostics],
  )
  const shown = filter === 'all' ? diagnostics : diagnostics.filter((item) => item.severity === filter)

  if (diagnostics.length === 0) {
    return <div className="p-3 text-[12px] text-faint">没有诊断信息。点击“编译/下载”进行完整检查。</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-panel-alt px-2 py-1 text-[11px]">
        <span className={counts.error > 0 ? 'font-semibold text-error' : 'text-dim'}>错误 {counts.error}</span>
        <span className={counts.warning > 0 ? 'font-semibold text-warn' : 'text-dim'}>警告 {counts.warning}</span>
        {counts.info > 0 && <span className="text-dim">信息 {counts.info}</span>}
        <span className="ml-auto flex items-center gap-0.5">
          {(['all', 'error', 'warning'] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded px-1.5 py-0.5 ${filter === item ? 'bg-accent-soft font-semibold text-accent' : 'text-dim hover:text-text'}`}
              onClick={() => setFilter(item)}
            >
              {item === 'all' ? '全部' : item === 'error' ? '仅错误' : '仅警告'}
            </button>
          ))}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {shown.map((diagnostic) => (
          <DiagnosticRow
            key={diagnostic.id}
            diagnostic={diagnostic}
            onNavigate={() => {
              if (diagnostic.blockId) setActiveBlock(diagnostic.blockId, diagnostic.networkId)
              if (diagnostic.networkId) setActiveNetwork(diagnostic.networkId)
              if (diagnostic.nodeId) {
                selectNode(diagnostic.nodeId)
                revealNode(diagnostic.nodeId)
              }
            }}
          />
        ))}
        {shown.length === 0 && <div className="p-3 text-center text-[12px] text-faint">当前筛选下没有诊断。</div>}
      </div>
    </div>
  )
}

function DiagnosticRow({ diagnostic, onNavigate }: { diagnostic: Diagnostic; onNavigate: () => void }) {
  // 工程级诊断（重名、未知引用等）没有块/网络位置，点击无处可跳。
  const locatable = Boolean(diagnostic.blockId || diagnostic.nodeId)
  return (
    <button
      type="button"
      disabled={!locatable}
      className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left ${locatable ? 'hover:bg-panel-alt' : 'cursor-default'}`}
      title={locatable ? '跳转到该位置' : '工程级诊断，没有可跳转的位置'}
      onClick={onNavigate}
    >
      <SeverityIcon severity={diagnostic.severity} />
      <span className="flex-1 text-[12px]">{diagnostic.message}</span>
      {locatable ? (
        <span className="shrink-0 text-[11px] text-accent">定位</span>
      ) : (
        <span className="shrink-0 text-[11px] text-faint">工程级</span>
      )}
    </button>
  )
}

function SeverityIcon({ severity }: { severity: Diagnostic['severity'] }) {
  if (severity === 'error') return <XCircle size={14} className="mt-0.5 shrink-0 text-error" />
  if (severity === 'warning') return <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
  return <Info size={14} className="mt-0.5 shrink-0 text-accent" />
}
