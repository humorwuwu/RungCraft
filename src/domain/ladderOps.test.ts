import { describe, expect, it } from 'vitest'
import {
  createCoil,
  createContact,
  createParallel,
  createSeries,
  deleteNodeAt,
  findNodePath,
  getNodeAt,
  insertParallelNode,
  insertSeriesNode,
  normalizeRoot,
} from './ladderOps'
import type { Operand } from './types'

const A: Operand = { kind: 'literal', dataType: 'BOOL', value: true }
const B: Operand = { kind: 'literal', dataType: 'BOOL', value: false }

describe('能流树操作', () => {
  it('在串联中按位置插入', () => {
    const first = createContact('NO', A)
    const second = createContact('NC', B)
    const root = createSeries([first, second])
    const inserted = createCoil('COIL', A)
    const next = insertSeriesNode(root, findNodePath(root, second.id)!, 'before', inserted)
    expect(findNodePath(next, inserted.id)).toEqual([1])
    expect(findNodePath(next, second.id)).toEqual([2])
  })

  it('在并联分支前插入时包装成新分支', () => {
    const left = createContact('NO', A)
    const right = createContact('NC', B)
    const root = createParallel([left, right])
    const inserted = createContact('NO', B)
    const next = insertSeriesNode(root, findNodePath(root, right.id)!, 'before', inserted)
    const parent = getNodeAt(next, [1])
    expect(parent?.kind).toBe('series')
    expect(findNodePath(next, inserted.id)).toEqual([1, 0])
  })

  it('插入并联分支', () => {
    const first = createContact('NO', A)
    const root = createSeries([first])
    const branch = createContact('NC', B)
    const next = insertParallelNode(root, findNodePath(root, first.id)!, 'after', branch)
    const parallel = getNodeAt(next, [0])
    expect(parallel?.kind).toBe('parallel')
    expect(findNodePath(next, branch.id)).toEqual([0, 1])
  })

  it('删除节点后保持结构可编辑', () => {
    const first = createContact('NO', A)
    const second = createContact('NC', B)
    const root = createSeries([first, second])
    const next = normalizeRoot(deleteNodeAt(root, findNodePath(root, first.id)!))
    // 根节点保持为组合节点，便于继续插入。
    expect(findNodePath(next, second.id)).toEqual([0])
  })

  it('删除根节点退化为空串联', () => {
    const root = createContact('NO', A)
    const next = deleteNodeAt(root, [])
    expect(next.kind).toBe('series')
  })
})
