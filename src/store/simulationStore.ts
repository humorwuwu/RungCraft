import { create } from 'zustand'
import type { Diagnostic } from '@/compiler/ir'
import type { ForceEntry, SimulationMode, WorkerStatus } from '@/workers/protocol'

export interface SimulationState {
  mode: SimulationMode
  buildId?: string
  hasErrors: boolean
  /** 面向界面的诊断 = 编译诊断 + 运行期诊断。 */
  diagnostics: Diagnostic[]
  /** 最近一次编译产生的诊断（运行期快照不应覆盖它）。 */
  compileDiagnostics: Diagnostic[]
  traceMap: Record<string, { inSlot: number; outSlot: number }>
  trace: Uint8Array
  values: Record<string, boolean | number>
  boxStates: Record<string, { q?: boolean; et?: number; cv?: number }>
  forces: ForceEntry[]
  scanCount: number
  simTimeMs: number
  lastScanMs: number
  scanTimeMs: number
  speed: number
  errorMessage?: string
  connected: boolean
  /** 最近一次“编译/下载”对应的工程 revision；与当前 revision 不同表示需要重新编译。 */
  downloadedRevision?: number

  setCompileResult: (payload: { buildId: string; diagnostics: Diagnostic[]; traceMap: Record<string, { inSlot: number; outSlot: number }>; hasErrors: boolean }) => void
  setStatus: (status: WorkerStatus) => void
  setSnapshot: (payload: {
    trace: Uint8Array
    values: Record<string, boolean | number>
    diagnostics: Diagnostic[]
    states: Record<string, { q?: boolean; et?: number; cv?: number }>
  }) => void
  setForces: (forces: ForceEntry[]) => void
  setError: (message?: string) => void
  setScanTime: (scanTimeMs: number) => void
  setSpeed: (speed: number) => void
  setConnected: (connected: boolean) => void
  setDownloadedRevision: (revision?: number) => void
}

export const useSimulationStore = create<SimulationState>()((set) => ({
  mode: 'stopped',
  hasErrors: false,
  diagnostics: [],
  compileDiagnostics: [],
  traceMap: {},
  trace: new Uint8Array(0),
  values: {},
  boxStates: {},
  forces: [],
  scanCount: 0,
  simTimeMs: 0,
  lastScanMs: 0,
  scanTimeMs: 20,
  speed: 1,
  connected: false,

  setCompileResult: ({ buildId, diagnostics, traceMap, hasErrors }) =>
    set({ buildId, diagnostics, compileDiagnostics: diagnostics, traceMap, hasErrors, errorMessage: undefined }),
  setStatus: (status) =>
    set({
      mode: status.mode,
      buildId: status.buildId,
      scanCount: status.scanCount,
      simTimeMs: status.simTimeMs,
      lastScanMs: status.lastScanMs,
      scanTimeMs: status.scanTimeMs,
      speed: status.speed,
    }),
  setSnapshot: ({ trace, values, diagnostics, states }) =>
    set((state) => {
      // 快照里的诊断只是运行期错误；编译诊断必须保留，否则编译报错会在第一次扫描后消失。
      const merged = diagnostics.length === 0 ? state.compileDiagnostics : dedupeDiagnostics([...state.compileDiagnostics, ...diagnostics])
      return {
        trace,
        values,
        // 引用稳定：诊断面板不会随每个扫描周期重渲染。
        diagnostics: sameDiagnostics(state.diagnostics, merged) ? state.diagnostics : merged,
        boxStates: states,
      }
    }),
  setForces: (forces) => set({ forces }),
  setError: (errorMessage) => set({ errorMessage }),
  setScanTime: (scanTimeMs) => set({ scanTimeMs }),
  setSpeed: (speed) => set({ speed }),
  setConnected: (connected) => set({ connected }),
  setDownloadedRevision: (downloadedRevision) => set({ downloadedRevision }),
}))

/** 按 id 去重（运行期错误可能与编译诊断重复）。 */
function dedupeDiagnostics(items: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
}

/** 两份诊断是否等价（id + 严重级别 + 文案）。 */
function sameDiagnostics(a: Diagnostic[], b: Diagnostic[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((item, index) => item.id === b[index].id && item.severity === b[index].severity && item.message === b[index].message)
}

/** 读取某个节点的能流状态；节点未编译时返回 false。 */
export function tracePower(state: SimulationState, nodeId: string | undefined, port: 'in' | 'out' = 'out'): boolean {
  if (!nodeId) return false
  const slots = state.traceMap[nodeId]
  if (!slots) return false
  const slot = port === 'in' ? slots.inSlot : slots.outSlot
  return state.trace[slot] === 1
}
