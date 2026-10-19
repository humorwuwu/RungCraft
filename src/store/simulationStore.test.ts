import { beforeEach, describe, expect, it } from 'vitest'
import type { Diagnostic } from '@/compiler/ir'
import { useSimulationStore } from './simulationStore'

const compileError: Diagnostic = { id: 'd1', severity: 'error', message: '标签名 start 重复。' }
const runtimeError: Diagnostic = { id: 'd2', severity: 'error', message: '除零。' }

function snapshot(diagnostics: Diagnostic[]) {
  useSimulationStore.getState().setSnapshot({
    trace: new Uint8Array(0),
    values: {},
    diagnostics,
    states: {},
  })
}

describe('仿真状态：诊断合并', () => {
  beforeEach(() => {
    useSimulationStore.setState({ diagnostics: [], compileDiagnostics: [], trace: new Uint8Array(0), values: {}, boxStates: {} })
  })

  it('运行期快照不会清掉编译诊断', () => {
    const store = useSimulationStore.getState()
    store.setCompileResult({ buildId: 'b1', diagnostics: [compileError], traceMap: {}, hasErrors: true })
    expect(useSimulationStore.getState().diagnostics).toHaveLength(1)

    // 第一次扫描后 worker 发来空的运行期诊断。
    snapshot([])
    expect(useSimulationStore.getState().diagnostics.map((item) => item.id)).toEqual(['d1'])

    // 运行期错误会追加进来。
    snapshot([runtimeError])
    expect(useSimulationStore.getState().diagnostics.map((item) => item.id)).toEqual(['d1', 'd2'])
  })

  it('诊断内容不变时保持引用稳定', () => {
    useSimulationStore.getState().setCompileResult({ buildId: 'b1', diagnostics: [compileError], traceMap: {}, hasErrors: true })
    const first = useSimulationStore.getState().diagnostics
    snapshot([])
    expect(useSimulationStore.getState().diagnostics).toBe(first)
  })
})
