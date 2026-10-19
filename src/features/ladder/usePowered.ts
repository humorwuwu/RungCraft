import { useSimulationStore } from '@/store/simulationStore'

export type TracePort = 'in' | 'out'

/**
 * 订阅单个节点/端口的能流状态。
 * 返回布尔值，Zustand 用 Object.is 比较，因此只有该位真正翻转的元素才会重渲染
 * （之前整张画布订阅 trace 位图，每个扫描周期都会重渲染全部元素与导线）。
 */
export function usePowered(nodeId: string | undefined, port: TracePort = 'out'): boolean {
  return useSimulationStore((state) => {
    if (!nodeId) return false
    const slots = state.traceMap[nodeId]
    if (!slots) return false
    return state.trace[port === 'in' ? slots.inSlot : slots.outSlot] === 1
  })
}
