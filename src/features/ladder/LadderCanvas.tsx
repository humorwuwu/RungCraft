import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { getInstruction } from '@/domain/catalog'
import { countElements, getNodeAt } from '@/domain/ladderOps'
import type { LadderNetwork, LadderNode, Operand, Project } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'
import {
  copyNode,
  deleteNode,
  insertInstruction,
  moveNode,
  pasteNode,
  setBoxParam,
  setCallBinding,
  setCoilVariant,
  setContactVariant,
  setNodeOperand,
} from '@/store/editorActions'
import { BoxElement, CallElement, CoilElement, ContactElement } from './elements'
import { layoutNetwork, NETWORK_PADDING_X, NETWORK_PADDING_Y, RAIL_W, type NodeLayout } from './layout'
import { LadderWire } from './power'
import { OperandEditor } from './OperandEditor'
import { revealNode } from './reveal'
import { ElementContextMenu, type ContextMenuState } from './ElementContextMenu'

interface LadderCanvasProps {
  blockId: string
  network: LadderNetwork
  project: Project
}

export function LadderCanvas({ blockId, network, project }: LadderCanvasProps) {
  const selectedNodeId = useUiStore((state) => state.selectedNodeId)
  const editingNodeId = useUiStore((state) => state.editingNodeId)
  const editingParam = useUiStore((state) => state.editingParam)
  const selectNode = useUiStore((state) => state.selectNode)
  const startEditing = useUiStore((state) => state.startEditing)
  const pendingInstructionId = useUiStore((state) => state.pendingInstructionId)
  const setPendingInstruction = useUiStore((state) => state.setPendingInstruction)
  const clipboard = useUiStore((state) => state.clipboard)
  const [dropHint, setDropHint] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | undefined>(undefined)

  const layout = useMemo(() => layoutNetwork(network.root), [network.root])

  // 稳定的回调：元素是 memo 组件，闭包每次新建会让 memo 失效。
  // 选中别的元素时同时结束内联编辑，避免编辑器停留在原元素上。
  const handleSelect = useCallback(
    (nodeId: string) => {
      startEditing(undefined)
      selectNode(nodeId)
    },
    [selectNode, startEditing],
  )
  const handleStartEdit = useCallback((nodeId: string, param?: string) => startEditing(nodeId, param), [startEditing])

  const sceneWidth = layout.width + NETWORK_PADDING_X * 2 + RAIL_W
  const sceneHeight = layout.height + NETWORK_PADDING_Y * 2

  const insertAtNode = (nodeId: string, position: 'before' | 'after', mode: 'series' | 'parallel', instructionId: string) => {
    insertInstruction(blockId, network.id, instructionId, { nodeId, position, mode })
  }

  const handleElementDrop = (event: DragEvent, nodeLayout: NodeLayout) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const position: 'before' | 'after' = event.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
    const mode: 'series' | 'parallel' = event.shiftKey ? 'parallel' : 'series'

    const movingNodeId = event.dataTransfer.getData('application/x-ladder-node')
    if (movingNodeId) {
      moveNode(blockId, network.id, movingNodeId, { nodeId: nodeLayout.nodeId, position, mode })
      setDropHint(null)
      setDraggingNodeId(undefined)
      return
    }

    const instructionId = event.dataTransfer.getData('application/x-ladder-instruction')
    if (!instructionId) return
    insertAtNode(nodeLayout.nodeId, position, mode, instructionId)
    setDropHint(null)
  }

  const handleWireDrop = (event: DragEvent, insertTarget: { parentPath: number[]; index: number }) => {
    event.preventDefault()
    event.stopPropagation()

    // 拖动已有元素到导线上：落到该索引对应的元素之前。
    const movingNodeId = event.dataTransfer.getData('application/x-ladder-node')
    if (movingNodeId) {
      const parent = getNodeAt(network.root, insertTarget.parentPath)
      if (parent && parent.kind === 'series') {
        const anchor = parent.children[insertTarget.index] ?? parent.children[parent.children.length - 1]
        const position: 'before' | 'after' = parent.children[insertTarget.index] ? 'before' : 'after'
        moveNode(blockId, network.id, movingNodeId, anchor ? { nodeId: anchor.id, position } : undefined)
      }
      setDropHint(null)
      setDraggingNodeId(undefined)
      return
    }

    const instructionId = event.dataTransfer.getData('application/x-ladder-instruction')
    if (!instructionId) return
    const node = getNodeAt(network.root, insertTarget.parentPath)
    if (!node || node.kind !== 'series') return
    // 直接按索引插入到串联组合。
    const root = network.root
    const parentPath = insertTarget.parentPath
    const index = insertTarget.index
    insertInstructionAtIndex(blockId, network.id, root, parentPath, index, instructionId)
    setDropHint(null)
  }

  const handleSceneClick = () => {
    setMenu(null)
    if (pendingInstructionId) {
      insertInstruction(blockId, network.id, pendingInstructionId)
      setPendingInstruction(undefined)
      return
    }
    // 点空白处同时退出内联编辑，避免编辑器悬空停留在元素上。
    startEditing(undefined)
    selectNode(undefined)
  }

  // 方向键在元素之间移动选择（左右按能流方向，上下按分支层次）。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.key.startsWith('Arrow')) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const leaves = layout.nodes.filter((item) => item.kind !== 'series' && item.kind !== 'parallel')
      if (leaves.length === 0) return
      const current = leaves.find((item) => item.nodeId === selectedNodeId)
      const next = current ? neighborOf(leaves, current, event.key) : leaves[0]
      if (!next) return
      event.preventDefault()
      selectNode(next.nodeId)
      revealNode(next.nodeId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [layout, selectedNodeId, selectNode])

  const menuNode = menu ? layout.nodes.find((item) => item.nodeId === menu.nodeId)?.node : undefined
  const editingLayout = editingNodeId ? layout.nodes.find((item) => item.nodeId === editingNodeId) : undefined
  const elementCount = countElements(network.root)
  const rootLayout = layout.nodes.find((item) => item.path.length === 0)

  return (
    <div
      className="ladder-viewport h-full w-full"
      onClick={handleSceneClick}
      onDragOver={(event) => {
        if (draggingNodeId) event.preventDefault()
      }}
      onDrop={(event) => {
        // 拖到空白处 = 移到网络末尾。
        const movingNodeId = event.dataTransfer.getData('application/x-ladder-node')
        if (!movingNodeId) return
        event.preventDefault()
        moveNode(blockId, network.id, movingNodeId)
        setDraggingNodeId(undefined)
        setDropHint(null)
      }}
    >
      <div className="ladder-scene" style={{ width: sceneWidth, height: sceneHeight }}>
        <svg className="pointer-events-none absolute inset-0" width={sceneWidth} height={sceneHeight}>
          <line
            className="ladder-rail"
            x1={NETWORK_PADDING_X - RAIL_W / 2}
            y1={NETWORK_PADDING_Y}
            x2={NETWORK_PADDING_X - RAIL_W / 2}
            y2={NETWORK_PADDING_Y + layout.height}
          />
          {elementCount > 0 && rootLayout && (
            <LadderWire
              points={`${NETWORK_PADDING_X - RAIL_W / 2},${rootLayout.y + rootLayout.h / 2 + NETWORK_PADDING_Y} ${rootLayout.x + NETWORK_PADDING_X},${rootLayout.y + rootLayout.h / 2 + NETWORK_PADDING_Y}`}
              nodeId={rootLayout.nodeId}
              port="in"
            />
          )}
          {layout.wires.map((wire) => (
            <LadderWire
              key={wire.id}
              points={wire.points.map((point) => `${point.x + NETWORK_PADDING_X},${point.y + NETWORK_PADDING_Y}`).join(' ')}
              nodeId={wire.trace.nodeId}
              port={wire.trace.port}
            />
          ))}
        </svg>

        {/* 导线拖放命中区 */}
        {layout.wires
          .filter((wire) => wire.insertTarget)
          .map((wire) => {
            const points = wire.points.map((point) => `${point.x + NETWORK_PADDING_X},${point.y + NETWORK_PADDING_Y}`).join(' ')
            return (
              <svg
                key={`${wire.id}_hit`}
                className="absolute inset-0"
                width={sceneWidth}
                height={sceneHeight}
                style={{ pointerEvents: 'none' }}
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="10"
                  style={{ pointerEvents: 'stroke', cursor: 'copy' }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    const point = wire.points[0]
                    setDropHint({
                      x: point.x + NETWORK_PADDING_X - 4,
                      y: point.y + NETWORK_PADDING_Y - 14,
                      w: 8,
                      h: 28,
                    })
                  }}
                  onDragLeave={() => setDropHint(null)}
                  onDrop={(event) => wire.insertTarget && handleWireDrop(event, wire.insertTarget)}
                />
              </svg>
            )
          })}

        {/* 空网络占位 */}
        {elementCount === 0 && (
          <div
            className="ladder-element"
            style={{
              left: (rootLayout?.x ?? 0) + NETWORK_PADDING_X,
              top: (rootLayout?.y ?? 0) + NETWORK_PADDING_Y,
              width: rootLayout?.w ?? 96,
              height: rootLayout?.h ?? 52,
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const instructionId = event.dataTransfer.getData('application/x-ladder-instruction')
              if (instructionId) insertInstruction(blockId, network.id, instructionId)
            }}
          >
            <div className="empty-slot">拖入指令</div>
          </div>
        )}

        {/* 元素层 */}
        {layout.nodes.map((nodeLayout) => {
          const node = nodeLayout.node
          if (node.kind === 'series' || node.kind === 'parallel') return null
          const common = {
            project,
            selected: selectedNodeId === node.id,
            onSelect: handleSelect,
            onStartEdit: handleStartEdit,
          }
          const style = {
            left: nodeLayout.x + NETWORK_PADDING_X,
            top: nodeLayout.y + NETWORK_PADDING_Y,
            width: nodeLayout.w,
            height: nodeLayout.h,
          }
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              className={`absolute ${draggingNodeId === node.id ? 'opacity-40' : ''}`}
              style={style}
              draggable
              onDragStart={(event) => {
                // 在输入框里选中文本时不要触发拖动。
                const target = event.target as HTMLElement
                if (target.tagName === 'INPUT' || target.isContentEditable) {
                  event.preventDefault()
                  return
                }
                event.dataTransfer.setData('application/x-ladder-node', node.id)
                event.dataTransfer.effectAllowed = 'move'
                setDraggingNodeId(node.id)
                selectNode(node.id)
              }}
              onDragEnd={() => {
                setDraggingNodeId(undefined)
                setDropHint(null)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = draggingNodeId ? 'move' : 'copy'
              }}
              onDrop={(event) => handleElementDrop(event, nodeLayout)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                selectNode(node.id)
                setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
              }}
            >
              {node.kind === 'contact' && <ContactElement node={node} {...common} />}
              {node.kind === 'coil' && <CoilElement node={node} {...common} />}
              {node.kind === 'box' && <BoxElement node={node} {...common} />}
              {node.kind === 'call' && <CallElement node={node} {...common} />}
              {editingNodeId === node.id && editingLayout && (
                <OperandEditor
                  project={project}
                  blockId={blockId}
                  initial={operandForEditing(node, editingParam)}
                  expectedType={expectedTypeForEditing(node, editingParam)}
                  allowEmpty={node.kind === 'box' && editingParam !== undefined}
                  onCommit={(operand) => {
                    if (node.kind === 'box' && editingParam) setBoxParam(blockId, network.id, node.id, editingParam, operand)
                    else if (node.kind === 'call' && editingParam) setCallBinding(blockId, network.id, node.id, editingParam, operand)
                    else if (operand) setNodeOperand(blockId, network.id, node.id, operand)
                    startEditing(undefined)
                  }}
                  onCancel={() => startEditing(undefined)}
                />
              )}
            </div>
          )
        })}

        {dropHint && (
          <div className="drop-indicator" style={{ left: dropHint.x, top: dropHint.y, width: dropHint.w, height: dropHint.h }} />
        )}

        {menu && menuNode && (
          <ElementContextMenu
            state={menu}
            node={menuNode}
            canPaste={Boolean(clipboard)}
            onClose={() => setMenu(null)}
            onEditOperand={() => startEditing(menu.nodeId)}
            onInsert={(instructionId, position, mode) => insertInstruction(blockId, network.id, instructionId, { nodeId: menu.nodeId, position, mode })}
            onSetContactVariant={(variant) => setContactVariant(blockId, network.id, menu.nodeId, variant)}
            onSetCoilVariant={(variant) => setCoilVariant(blockId, network.id, menu.nodeId, variant)}
            onCopy={() => copyNode(blockId, network.id, menu.nodeId)}
            onPaste={() => pasteNode(blockId, network.id, { nodeId: menu.nodeId, position: 'after' })}
            onDelete={() => deleteNode(blockId, network.id, menu.nodeId)}
          />
        )}
      </div>
    </div>
  )
}

/** 在叶子元素中按方向找相邻元素。 */
function neighborOf(leaves: NodeLayout[], current: NodeLayout, key: string): NodeLayout | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const ordered = leaves.slice().sort((a, b) => a.x - b.x || a.y - b.y)
    const index = ordered.findIndex((item) => item.nodeId === current.nodeId)
    return ordered[key === 'ArrowLeft' ? index - 1 : index + 1]
  }
  const above = key === 'ArrowUp'
  let best: NodeLayout | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of leaves) {
    if (item.nodeId === current.nodeId) continue
    const dy = item.y - current.y
    if (above ? dy >= -4 : dy <= 4) continue
    const score = Math.abs(dy) + Math.abs(item.x - current.x) * 0.5
    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

function operandForEditing(node: LadderNode, param: string | undefined): Operand | undefined {
  if (node.kind === 'contact' || node.kind === 'coil') return node.operand
  if (node.kind === 'box' && param) return node.params[param]
  if (node.kind === 'call' && param) return node.bindings[param]
  return undefined
}

function expectedTypeForEditing(node: LadderNode, param: string | undefined) {
  if (node.kind === 'contact' || node.kind === 'coil') return 'BOOL' as const
  if (node.kind === 'box' && param) {
    const def = getInstruction(node.instructionId)
    const spec = def?.params.find((item) => item.name === param)
    return spec?.dataTypes[0]
  }
  return undefined
}

/** 按已解析的串联索引插入；用于导线命中区。 */
function insertInstructionAtIndex(
  blockId: string,
  networkId: string,
  root: LadderNode,
  parentPath: number[],
  index: number,
  instructionId: string,
): void {
  const parent = getNodeAt(root, parentPath)
  if (!parent || parent.kind !== 'series') return
  // 通过“在索引处的元素之前插入”来表达；若索引等于长度则追加到该串联末尾。
  const child = parent.children[index]
  if (child) {
    insertInstruction(blockId, networkId, instructionId, { nodeId: child.id, position: 'before', mode: 'series' })
    return
  }
  const last = parent.children[parent.children.length - 1]
  if (last) {
    insertInstruction(blockId, networkId, instructionId, { nodeId: last.id, position: 'after', mode: 'series' })
  } else {
    insertInstruction(blockId, networkId, instructionId)
  }
}
