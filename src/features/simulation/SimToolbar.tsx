import { Download, Pause, Play, RefreshCw, RotateCcw, Square, StepForward } from 'lucide-react'
import type { Project } from '@/domain/types'
import { useProjectStore } from '@/store/projectStore'
import { useSimulationStore } from '@/store/simulationStore'
import { simClient } from '@/workers/simClient'
import { ToolButton } from '@/components/ui'
import { compileAndDownload } from './actions'

export function SimToolbar({ project }: { project: Project }) {
  const mode = useSimulationStore((state) => state.mode)
  const scanTimeMs = useSimulationStore((state) => state.scanTimeMs)
  const speed = useSimulationStore((state) => state.speed)
  const scanCount = useSimulationStore((state) => state.scanCount)
  const simTimeMs = useSimulationStore((state) => state.simTimeMs)
  const lastScanMs = useSimulationStore((state) => state.lastScanMs)
  const hasErrors = useSimulationStore((state) => state.hasErrors)
  const errorMessage = useSimulationStore((state) => state.errorMessage)
  const diagnostics = useSimulationStore((state) => state.diagnostics)
  const revision = useProjectStore((state) => state.revision)
  const buildId = useSimulationStore((state) => state.buildId)
  const downloadedRevision = useSimulationStore((state) => state.downloadedRevision)

  const download = () => compileAndDownload(project)

  const running = mode === 'running'
  const synced = downloadedRevision !== undefined && downloadedRevision === revision

  return (
    <div className="flex items-center gap-1">
      <ToolButton
        label="编译/下载"
        icon={<Download size={13} />}
        title="编译工程并下载到仿真器"
        onClick={download}
        className={hasErrors ? 'text-error' : undefined}
      />
      <span className="mx-1 h-4 w-px bg-border" />
      <ToolButton
        label={running ? '暂停' : '运行'}
        icon={running ? <Pause size={13} /> : <Play size={13} />}
        active={running}
        title={running ? '暂停扫描' : '启动扫描'}
        onClick={() => (running ? simClient.pause() : simClient.run())}
      />
      <ToolButton label="单步" icon={<StepForward size={13} />} title="执行一次扫描" onClick={() => simClient.step()} />
      <ToolButton label="停止" icon={<Square size={13} />} title="停止仿真" onClick={() => simClient.stop()} />
      <ToolButton label="复位" icon={<RotateCcw size={13} />} title="复位内存与状态" onClick={() => simClient.reset()} />
      <span className="mx-1 h-4 w-px bg-border" />
      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-dim">
        周期
        <select
          className="field-input h-6 w-20"
          data-testid="scan-time"
          value={scanTimeMs}
          onChange={(event) => simClient.setScanTime(Number(event.target.value))}
        >
          {[1, 5, 10, 20, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value} ms
            </option>
          ))}
        </select>
      </label>
      <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-dim">
        速度
        <select className="field-input h-6 w-16" data-testid="speed" value={speed} onChange={(event) => simClient.setSpeed(Number(event.target.value))}>
          {[0.5, 1, 2, 5, 10].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
      <span className="mx-1 h-4 w-px bg-border" />
      <span className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
        <ModeBadge mode={mode} />
        <span>扫描 {scanCount}</span>
        <span>时间 {(simTimeMs / 1000).toFixed(2)} s</span>
        <span className={lastScanMs > scanTimeMs ? 'text-warn' : ''}>耗时 {lastScanMs.toFixed(2)} ms</span>
        {buildId && <span title={buildId}>版本 {buildId.slice(-6)}</span>}
        {synced ? (
          <span className="text-faint">已同步</span>
        ) : downloadedRevision === undefined ? (
          <span className="text-faint">未下载</span>
        ) : (
          <button
            type="button"
            data-testid="resync-badge"
            className="flex items-center gap-1 rounded border border-warn px-1.5 py-0.5 font-semibold text-warn hover:bg-warn/10"
            title="工程已修改，当前运行的仍是上一版程序；点击重新编译"
            onClick={download}
          >
            <RefreshCw size={11} />已修改，需重新编译
          </button>
        )}
      </span>
      {(errorMessage || hasErrors || diagnostics.some((item) => item.severity === 'error')) && (
        <span className="ml-2 rounded bg-error/10 px-2 py-0.5 text-[11px] text-error">
          {errorMessage ?? '存在编译错误'}
        </span>
      )}
    </div>
  )
}

function ModeBadge({ mode }: { mode: string }) {
  const label = mode === 'running' ? '运行' : mode === 'paused' ? '暂停' : '停止'
  const color = mode === 'running' ? 'bg-power text-white' : mode === 'paused' ? 'bg-warn text-white' : 'bg-panel-sunken text-dim'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>{label}</span>
}
