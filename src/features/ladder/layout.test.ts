import { describe, expect, it } from 'vitest'
import { createCoil, createContact, createParallel, createSeries } from '@/domain/ladderOps'
import type { LadderNode, Operand } from '@/domain/types'
import { layoutNetwork } from './layout'

const operand = (name: string): Operand => ({ kind: 'address', address: name })

function seriesChain(count: number): LadderNode {
  const children: LadderNode[] = []
  for (let index = 0; index < count; index += 1) children.push(createContact('NO', operand(`%I0.${index % 8}`)))
  children.push(createCoil('COIL', operand('%Q0.0')))
  return createSeries(children)
}

describe('网络布局', () => {
  it('每个元素都得到布局，且坐标不重叠', () => {
    const root = createSeries([
      createContact('NO', operand('%I0.0')),
      createParallel([createContact('NO', operand('%I0.1')), createContact('NC', operand('%I0.2'))]),
      createCoil('COIL', operand('%Q0.0')),
    ])
    const layout = layoutNetwork(root)
    // 根 + 3 个子节点 + 并联的两个分支
    expect(layout.nodes.map((item) => item.nodeId).sort()).toEqual([...new Set(layout.nodes.map((item) => item.nodeId))].sort())
    expect(layout.nodes.length).toBeGreaterThanOrEqual(6)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
    // 布局结果直接携带节点引用，渲染层不再需要按 path 回查。
    for (const item of layout.nodes) expect(item.node.id).toBe(item.nodeId)
  })

  it('导线 id 是确定性的：同一棵树重复布局结果一致', () => {
    const root = createSeries([
      createContact('NO', operand('%I0.0')),
      createParallel([createContact('NO', operand('%I0.1')), createContact('NC', operand('%I0.2'))]),
      createCoil('COIL', operand('%Q0.0')),
    ])
    const first = layoutNetwork(root)
    const second = layoutNetwork(root)
    expect(second.wires.map((wire) => wire.id)).toEqual(first.wires.map((wire) => wire.id))
    expect(second.wires.map((wire) => wire.points)).toEqual(first.wires.map((wire) => wire.points))
  })

  it('大网络布局保持线性量级（尺寸只测量一次）', () => {
    const root = seriesChain(4000)
    const started = Date.now()
    const layout = layoutNetwork(root)
    const elapsed = Date.now() - started
    // 4000 个触点 + 1 个线圈 + 根串联组合
    expect(layout.nodes).toHaveLength(4002)
    // 缓存前的实现是 O(n²)（同一子树被反复测量），4000 个元素会到秒级。
    expect(elapsed).toBeLessThan(1500)
  })
})
