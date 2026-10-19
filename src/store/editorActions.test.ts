import { beforeEach, describe, expect, it } from 'vitest'
import { createMotorSampleProject } from '@/domain/project'
import { createBox, createContact, createSeries } from '@/domain/ladderOps'
import type { LadderNode } from '@/domain/types'
import { useProjectStore } from './projectStore'
import { moveNode } from './editorActions'

function networkRoot(): LadderNode {
  const project = useProjectStore.getState().project
  return project.blocks[0].networks[0].root
}

/** 按布局顺序列出叶子节点的描述，便于断言顺序。 */
function leafIds(node: LadderNode): string[] {
  if (node.kind === 'series' || node.kind === 'parallel') return node.children.flatMap(leafIds)
  return [node.id]
}

describe('拖动元素（moveNode）', () => {
  beforeEach(() => {
    useProjectStore.getState().replaceProject(createMotorSampleProject(), { markClean: true })
  })

  it('把线圈拖到停止触点之前', () => {
    const project = useProjectStore.getState().project
    const network = project.blocks[0].networks[0]
    const before = leafIds(network.root)
    // 网络 1：并联(Start, Motor) → Stop(NC) → 线圈 Motor
    expect(before).toHaveLength(4)

    const coilId = before[3]
    const stopId = before[2]
    moveNode(project.blocks[0].id, network.id, coilId, { nodeId: stopId, position: 'before' })

    expect(leafIds(networkRoot())).toEqual([before[0], before[1], coilId, stopId])
  })

  it('拖到自己或自己的子树上会被忽略', () => {
    const project = useProjectStore.getState().project
    const network = project.blocks[0].networks[0]
    const ids = leafIds(network.root)
    moveNode(project.blocks[0].id, network.id, ids[0], { nodeId: ids[0], position: 'after' })
    expect(leafIds(networkRoot())).toEqual(ids)
  })

  it('拖到空白处 = 移到网络末尾，且节点 id 保持不变', () => {
    const project = useProjectStore.getState().project
    const network = project.blocks[0].networks[0]
    const ids = leafIds(network.root)
    moveNode(project.blocks[0].id, network.id, ids[0])
    const after = leafIds(networkRoot())
    expect(after).toHaveLength(ids.length)
    expect(after[after.length - 1]).toBe(ids[0])
    // id 保持：定时器/计数器/边沿状态按节点 id 绑定。
    expect(new Set(after)).toEqual(new Set(ids))
  })

  it('移走分支里的唯一元素后不会留下空占位', () => {
    const project = useProjectStore.getState().project
    const network = project.blocks[0].networks[0]
    const ids = leafIds(network.root)
    // 先把 Stop 触点移到末尾，再把它移回并联分支里，检查并联分支不会残留空串联。
    moveNode(project.blocks[0].id, network.id, ids[2])
    moveNode(project.blocks[0].id, network.id, ids[2], { nodeId: ids[3], position: 'before' })

    const collectEmpty = (node: LadderNode): number => {
      if (node.kind !== 'series' && node.kind !== 'parallel') return 0
      const self = node.children.length === 0 ? 1 : 0
      return self + node.children.reduce((sum, child) => sum + collectEmpty(child), 0)
    }
    expect(collectEmpty(networkRoot())).toBe(0)
    expect(leafIds(networkRoot())).toHaveLength(4)
  })

  it('可以新建元素后移动（不改变其它元素）', () => {
    const project = useProjectStore.getState().project
    const network = project.blocks[0].networks[0]
    const ids = leafIds(network.root)
    moveNode(project.blocks[0].id, network.id, ids[1], { nodeId: ids[0], position: 'before' })
    expect(leafIds(networkRoot())).toEqual([ids[1], ids[0], ids[2], ids[3]])
  })
})

describe('梯形图节点构造', () => {
  it('createSeries/createContact/createBox 生成稳定结构', () => {
    const node = createSeries([createContact('NO', { kind: 'address', address: '%I0.0' }), createBox('box.TON', {})])
    expect(node.kind).toBe('series')
    expect(node.children).toHaveLength(2)
    expect(node.children[1].kind).toBe('box')
  })
})
