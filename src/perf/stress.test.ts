import { describe, expect, it } from 'vitest'
import { compileProject } from '@/compiler/compile'
import { createStressProject } from '@/domain/stressProject'
import { layoutNetwork } from '@/features/ladder/layout'
import { SimulationEngine } from '@/runtime/engine'

/**
 * 性能基线（对应实施计划里的“约 500 网络 / 5000 元素”压力工程）。
 * 预算给得比较宽松，只用于拦住量级退化（例如 O(n²) 回归），不作为精确基准。
 */
describe('性能基线：大工程', () => {
  it('500 个网络 / 约 5500 个元素的编译与扫描在预算内', () => {
    const project = createStressProject(500, 10)

    const compileStart = Date.now()
    const program = compileProject(project, 'stress')
    const compileMs = Date.now() - compileStart
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    const engine = new SimulationEngine(program)
    const scanStart = Date.now()
    for (let index = 0; index < 10; index += 1) engine.scan(20)
    const scanMs = Date.now() - scanStart

    // eslint-disable-next-line no-console
    console.log(`[perf] 网络 ${program.blocks[0].networks.length} 个，编译 ${compileMs} ms，10 次扫描 ${scanMs} ms`)
    expect(compileMs).toBeLessThan(5000)
    expect(scanMs).toBeLessThan(2000)
  })

  it('单个大网络的布局在预算内', () => {
    const project = createStressProject(1, 2000)
    const root = project.blocks[0].networks[0].root
    const started = Date.now()
    const layout = layoutNetwork(root)
    const elapsed = Date.now() - started
    // eslint-disable-next-line no-console
    console.log(`[perf] 单网络 ${layout.nodes.length} 个元素布局 ${elapsed} ms`)
    expect(elapsed).toBeLessThan(1000)
  })
})
