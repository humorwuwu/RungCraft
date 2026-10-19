import { getInstruction } from '@/domain/catalog'
import type { LadderNode } from '@/domain/types'
import { isCombinator } from '@/domain/types'

export const UNIT_W = 44
export const ROW_H = 52
export const ELEMENT_GAP = 14
export const BRANCH_GAP = 18
export const BUS_PAD = 14
export const EMPTY_W = 96
export const RAIL_W = 14
export const NETWORK_PADDING_X = 22
export const NETWORK_PADDING_Y = 18
export const BOX_HEIGHT = ROW_H * 2

export interface Point {
  x: number
  y: number
}

export type TracePort = 'in' | 'out'

export interface WireSegment {
  id: string
  points: Point[]
  trace: { nodeId: string; port: TracePort }
  /** 串联插入位置；拖拽到导线上时使用。 */
  insertTarget?: { parentPath: number[]; index: number }
  kind: 'series' | 'branch'
}

export interface NodeLayout {
  nodeId: string
  /** 布局时直接携带节点引用，渲染层无需再用 path 回查能流树。 */
  node: LadderNode
  path: number[]
  x: number
  y: number
  w: number
  h: number
  kind: LadderNode['kind']
  parentKind: 'series' | 'parallel' | null
  index: number
}

export interface NetworkLayout {
  width: number
  height: number
  nodes: NodeLayout[]
  wires: WireSegment[]
  rail: { x: number; top: number; bottom: number }
}

interface Size {
  w: number
  h: number
}

export function leafSize(node: LadderNode): Size {
  switch (node.kind) {
    case 'contact':
    case 'coil':
      return { w: UNIT_W * 2, h: ROW_H }
    case 'box': {
      const def = getInstruction(node.instructionId)
      const units = def?.widthUnits ?? 4
      return { w: UNIT_W * units, h: BOX_HEIGHT }
    }
    case 'call':
      return { w: UNIT_W * 5, h: BOX_HEIGHT }
    default:
      return { w: EMPTY_W, h: ROW_H }
  }
}

/**
 * 每个节点的尺寸只算一次。
 * 之前 placeNode/placeSeries/placeParallel 都会重新 measureNode 整棵子树，
 * 串联链上累计成 O(n²)；现在用一次自底向上的遍历缓存结果。
 */
type SizeCache = Map<LadderNode, Size>

function measureCached(node: LadderNode, cache: SizeCache): Size {
  const cached = cache.get(node)
  if (cached) return cached
  const size = computeSize(node, cache)
  cache.set(node, size)
  return size
}

function computeSize(node: LadderNode, cache: SizeCache): Size {
  if (node.kind === 'series') {
    if (node.children.length === 0) return { w: EMPTY_W, h: ROW_H }
    let width = 0
    let height = 0
    node.children.forEach((child, index) => {
      const size = measureCached(child, cache)
      width += size.w
      if (index > 0) width += ELEMENT_GAP
      height = Math.max(height, size.h)
    })
    return { w: width, h: height }
  }
  if (node.kind === 'parallel') {
    if (node.children.length === 0) return { w: EMPTY_W, h: ROW_H }
    let width = 0
    let height = 0
    node.children.forEach((child, index) => {
      const size = measureCached(child, cache)
      width = Math.max(width, size.w)
      height += size.h
      if (index > 0) height += BRANCH_GAP
    })
    return { w: width + BUS_PAD * 2, h: height }
  }
  return leafSize(node)
}

export function measureNode(node: LadderNode): Size {
  return measureCached(node, new Map())
}

interface Builder {
  nodes: NodeLayout[]
  wires: WireSegment[]
}

/** 路径键：同一棵树的同一位置始终得到同一个导线 id，避免编辑时整批重挂。 */
function pathKey(path: number[]): string {
  return path.join('.')
}

function pushWire(
  builder: Builder,
  id: string,
  points: Point[],
  trace: WireSegment['trace'],
  kind: WireSegment['kind'],
  insertTarget?: WireSegment['insertTarget'],
): void {
  builder.wires.push({ id, points, trace, kind, insertTarget })
}

function pushNode(builder: Builder, node: NodeLayout): void {
  builder.nodes.push(node)
}

/**
 * 计算网络的几何布局。纯函数：输入能流树，输出绝对坐标的元素框和导线。
 * 坐标为网络内容局部坐标；渲染时再加上电源轨和 padding。
 */
export function layoutNetwork(root: LadderNode): NetworkLayout {
  const builder: Builder = { nodes: [], wires: [] }
  const cache: SizeCache = new Map()
  const size = measureCached(root, cache)
  placeNode(root, [], 0, 0, builder, null, 0, cache)

  const railTop = 0
  const railBottom = size.h

  return {
    width: size.w,
    height: size.h,
    nodes: builder.nodes,
    wires: builder.wires,
    rail: { x: -RAIL_W, top: railTop, bottom: railBottom },
  }
}

function placeNode(
  node: LadderNode,
  path: number[],
  x: number,
  y: number,
  builder: Builder,
  parentKind: 'series' | 'parallel' | null,
  index: number,
  cache: SizeCache,
): void {
  const size = measureCached(node, cache)
  pushNode(builder, {
    nodeId: node.id,
    node,
    path,
    x,
    y,
    w: size.w,
    h: size.h,
    kind: node.kind,
    parentKind,
    index,
  })

  if (node.kind === 'series') {
    placeSeries(node, path, x, y, size, builder, cache)
    return
  }
  if (node.kind === 'parallel') {
    placeParallel(node, path, x, y, size, builder, cache)
  }
}

function placeSeries(
  node: Extract<LadderNode, { kind: 'series' }>,
  path: number[],
  x: number,
  y: number,
  size: Size,
  builder: Builder,
  cache: SizeCache,
): void {
  const centerY = y + size.h / 2
  if (node.children.length === 0) {
    return
  }
  const key = pathKey(path)
  let cursor = x
  let previousRight: number | undefined
  node.children.forEach((child, childIndex) => {
    const childSize = measureCached(child, cache)
    const childY = y + (size.h - childSize.h) / 2
    if (previousRight !== undefined) {
      pushWire(
        builder,
        `s|${key}|${childIndex}`,
        [
          { x: previousRight, y: centerY },
          { x: cursor, y: centerY },
        ],
        { nodeId: node.id, port: 'in' },
        'series',
        { parentPath: path, index: childIndex },
      )
    }
    placeNode(child, [...path, childIndex], cursor, childY, builder, 'series', childIndex, cache)
    previousRight = cursor + childSize.w
    cursor += childSize.w + ELEMENT_GAP
  })
}

function placeParallel(
  node: Extract<LadderNode, { kind: 'parallel' }>,
  path: number[],
  x: number,
  y: number,
  size: Size,
  builder: Builder,
  cache: SizeCache,
): void {
  const key = pathKey(path)
  const branchWidth = size.w - BUS_PAD * 2
  const inputBusX = x + BUS_PAD / 2
  const outputBusX = x + size.w - BUS_PAD / 2
  const centerY = y + size.h / 2

  let cursor = y
  const branchCenters: number[] = []
  node.children.forEach((child, childIndex) => {
    const childSize = measureCached(child, cache)
    const childX = x + BUS_PAD + Math.max(0, (branchWidth - childSize.w) / 2)
    const childCenterY = cursor + childSize.h / 2
    branchCenters.push(childCenterY)

    // 输入母线 -> 分支起点
    pushWire(
      builder,
      `pi|${key}|${childIndex}`,
      [
        { x: inputBusX, y: childCenterY },
        { x: childX, y: childCenterY },
      ],
      { nodeId: node.id, port: 'in' },
      'branch',
    )
    placeNode(child, [...path, childIndex], childX, cursor, builder, 'parallel', childIndex, cache)

    // 分支终点 -> 输出母线
    pushWire(
      builder,
      `po|${key}|${childIndex}`,
      [
        { x: childX + childSize.w, y: childCenterY },
        { x: outputBusX, y: childCenterY },
      ],
      { nodeId: child.id, port: 'out' },
      'branch',
    )
    cursor += childSize.h + BRANCH_GAP
  })

  if (branchCenters.length > 0) {
    const first = branchCenters[0]
    const last = branchCenters[branchCenters.length - 1]
    // 竖向输入母线
    pushWire(
      builder,
      `pvi|${key}`,
      [
        { x: inputBusX, y: first },
        { x: inputBusX, y: last },
      ],
      { nodeId: node.id, port: 'in' },
      'branch',
    )
    // 竖向输出母线
    pushWire(
      builder,
      `pvo|${key}`,
      [
        { x: outputBusX, y: first },
        { x: outputBusX, y: last },
      ],
      { nodeId: node.id, port: 'out' },
      'branch',
    )
    // 并联入口与出口
    pushWire(
      builder,
      `pe|${key}`,
      [
        { x, y: centerY },
        { x: inputBusX, y: centerY },
      ],
      { nodeId: node.id, port: 'in' },
      'branch',
    )
    pushWire(
      builder,
      `px|${key}`,
      [
        { x: outputBusX, y: centerY },
        { x: x + size.w, y: centerY },
      ],
      { nodeId: node.id, port: 'out' },
      'branch',
    )
  }
}

/** 判断节点是否可以作为并联分支容器（供 UI 使用）。 */
export function isBranchContainer(node: LadderNode): boolean {
  return isCombinator(node)
}
