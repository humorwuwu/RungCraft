import { newId } from './ids'
import type { BoxNode, CallNode, CoilNode, CoilVariant, ContactNode, ContactVariant, LadderNode, Operand, ParallelNode, SeriesNode } from './types'
import { isCombinator } from './types'

/* ------------------------------------------------------------------ */
/* 构造                                                                */
/* ------------------------------------------------------------------ */

export function createSeries(children: LadderNode[] = []): SeriesNode {
  return { id: newId('ser'), kind: 'series', children }
}

export function createParallel(children: LadderNode[] = []): ParallelNode {
  return { id: newId('par'), kind: 'parallel', children }
}

export function createContact(variant: ContactVariant, operand: Operand): ContactNode {
  return { id: newId('con'), kind: 'contact', variant, operand }
}

export function createCoil(variant: CoilVariant, operand: Operand): CoilNode {
  return { id: newId('coil'), kind: 'coil', variant, operand }
}

export function createBox(instructionId: string, params: Record<string, Operand | undefined> = {}): BoxNode {
  return { id: newId('box'), kind: 'box', instructionId, params, en: true, eno: true }
}

export function createCall(
  blockId: string,
  instanceDbId?: string,
  bindings: Record<string, Operand | undefined> = {},
  instanceRef?: Operand,
): CallNode {
  return { id: newId('call'), kind: 'call', blockId, instanceDbId, instanceRef, bindings, en: true, eno: true }
}

/* ------------------------------------------------------------------ */
/* 遍历与路径                                                          */
/* ------------------------------------------------------------------ */

/** 深度优先查找节点，返回从根开始的孩子索引路径；根为 []。 */
export function findNodePath(root: LadderNode, nodeId: string): number[] | undefined {
  if (root.id === nodeId) return []
  if (!isCombinator(root)) return undefined
  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index]
    const childPath = findNodePath(child, nodeId)
    if (childPath) return [index, ...childPath]
  }
  return undefined
}

export function getNodeAt(root: LadderNode, path: number[]): LadderNode | undefined {
  let current: LadderNode | undefined = root
  for (const index of path) {
    if (!current || !isCombinator(current)) return undefined
    current = current.children[index]
  }
  return current
}

export function getParentAt(root: LadderNode, path: number[]): LadderNode | undefined {
  if (path.length === 0) return undefined
  return getNodeAt(root, path.slice(0, -1))
}

export function pathKey(path: number[]): string {
  return path.join('.')
}

export function collectNodeIds(node: LadderNode, out: string[] = []): string[] {
  out.push(node.id)
  if (isCombinator(node)) {
    for (const child of node.children) collectNodeIds(child, out)
  }
  return out
}

export function countElements(node: LadderNode): number {
  if (isCombinator(node)) return node.children.reduce((sum, child) => sum + countElements(child), 0)
  return 1
}

/* ------------------------------------------------------------------ */
/* 不可变替换                                                          */
/* ------------------------------------------------------------------ */

function replaceChild(node: LadderNode, index: number, next: LadderNode): LadderNode {
  if (!isCombinator(node)) return node
  const children = node.children.slice()
  children[index] = next
  return { ...node, children }
}

export function replaceNodeAt(root: LadderNode, path: number[], next: LadderNode): LadderNode {
  if (path.length === 0) return next
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1]
  const parent = getNodeAt(root, parentPath)
  if (!parent || !isCombinator(parent)) return root
  const replaced = replaceChild(parent, index, next)
  return replaceNodeAt(root, parentPath, replaced)
}

/** 删除节点；若父组合为空则保留空组合作为占位。 */
export function deleteNodeAt(root: LadderNode, path: number[]): LadderNode {
  if (path.length === 0) {
    // 根节点不允许直接删除；退化为空串联占位。
    return createSeries([])
  }
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1]
  const parent = getNodeAt(root, parentPath)
  if (!parent || !isCombinator(parent)) return root
  const children = parent.children.filter((_, childIndex) => childIndex !== index)
  const nextParent: LadderNode = { ...parent, children }
  return replaceNodeAt(root, parentPath, nextParent)
}

export function insertChildAt(root: LadderNode, parentPath: number[], index: number, node: LadderNode): LadderNode {
  const parent = getNodeAt(root, parentPath)
  if (!parent || !isCombinator(parent)) return root
  const children = parent.children.slice()
  const clamped = Math.max(0, Math.min(index, children.length))
  children.splice(clamped, 0, node)
  return replaceNodeAt(root, parentPath, { ...parent, children })
}

/* ------------------------------------------------------------------ */
/* 编辑操作                                                            */
/* ------------------------------------------------------------------ */

export type InsertPosition = 'before' | 'after'

/**
 * 在目标元素前/后插入串联元素。
 * 若父节点是并联，则把目标与插入元素组成新的串联分支，保持原分支语义。
 */
export function insertSeriesNode(root: LadderNode, targetPath: number[], position: InsertPosition, node: LadderNode): LadderNode {
  const target = getNodeAt(root, targetPath)
  if (!target) return root
  const parent = getParentAt(root, targetPath)

  if (!parent) {
    // 目标是根：用串联把新元素与原根连起来。
    const children = position === 'before' ? [node, root] : [root, node]
    return createSeries(children)
  }

  const index = targetPath[targetPath.length - 1]
  if (parent.kind === 'series') {
    return insertChildAt(root, targetPath.slice(0, -1), position === 'before' ? index : index + 1, node)
  }

  // 父节点是并联：把当前分支替换为 [原分支, 新元素] 或 [新元素, 原分支]。
  const branch = position === 'before' ? createSeries([node, target]) : createSeries([target, node])
  return replaceNodeAt(root, targetPath, branch)
}

/**
 * 在目标元素所在分支旁新建一个并联分支。
 * 若父节点已经是并联，则直接在该分支前/后插入；否则把目标包进新的并联组合。
 */
export function insertParallelNode(root: LadderNode, targetPath: number[], position: InsertPosition, node: LadderNode): LadderNode {
  const target = getNodeAt(root, targetPath)
  if (!target) return root
  const parent = getParentAt(root, targetPath)

  if (!parent) {
    const children = position === 'before' ? [node, root] : [root, node]
    return createParallel(children)
  }

  const index = targetPath[targetPath.length - 1]
  if (parent.kind === 'parallel') {
    return insertChildAt(root, targetPath.slice(0, -1), position === 'before' ? index : index + 1, node)
  }

  const branch = position === 'before' ? createParallel([node, target]) : createParallel([target, node])
  return replaceNodeAt(root, targetPath, branch)
}

/** 在顶层串联末尾追加元素；根不是串联时自动包装。 */
export function appendSeriesNode(root: LadderNode, node: LadderNode): LadderNode {
  if (root.kind === 'series') {
    return { ...root, children: [...root.children, node] }
  }
  return createSeries([root, node])
}

/** 在顶层并联末尾追加分支。 */
export function appendParallelBranch(root: LadderNode, node: LadderNode): LadderNode {
  if (root.kind === 'parallel') {
    return { ...root, children: [...root.children, node] }
  }
  return createParallel([root, node])
}

/* ------------------------------------------------------------------ */
/* 复制与规整                                                          */
/* ------------------------------------------------------------------ */

/** 深拷贝子树并重新生成全部 ID。 */
export function cloneSubtree(node: LadderNode): LadderNode {
  const id = newId(node.kind)
  if (isCombinator(node)) {
    return { ...node, id, children: node.children.map(cloneSubtree) } as LadderNode
  }
  if (node.kind === 'box') {
    return { ...node, id, params: { ...node.params } }
  }
  if (node.kind === 'call') {
    return { ...node, id, bindings: { ...node.bindings } }
  }
  return { ...node, id }
}

/**
 * 去掉父节点下空掉的组合子节点。
 * 拖动元素离开某个分支后会留下空占位，这里把它清理掉；
 * 若清理后父节点为空，则保留原样（根节点仍是空占位）。
 */
export function pruneEmptyChildren(node: LadderNode): LadderNode {
  if (!isCombinator(node)) return node
  const children = node.children.map(pruneEmptyChildren)
  const nonEmpty = children.filter((child) => !(isCombinator(child) && child.children.length === 0))
  return { ...node, children: nonEmpty.length > 0 ? nonEmpty : children.slice(0, 1) }
}

/** 递归化简只有一个孩子的串联/并联，减少无意义嵌套。 */
export function simplifyNode(node: LadderNode): LadderNode {
  if (!isCombinator(node)) return node
  const children = node.children.map(simplifyNode)
  if (children.length === 1) return children[0]
  return { ...node, children }
}

/** 网络根节点的规整：保持根为组合节点，便于插入与布局。 */
export function normalizeRoot(node: LadderNode): LadderNode {
  const simplified = simplifyNode(node)
  if (isCombinator(simplified)) return simplified
  return createSeries([simplified])
}
