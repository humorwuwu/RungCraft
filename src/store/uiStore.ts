import { create } from 'zustand'
import type { LadderNode } from '@/domain/types'

export type LeftPanelTab = 'project' | 'palette'
export type RightPanelTab = 'properties' | 'watch'
export type BottomPanelTab = 'problems' | 'watch' | 'io'
export type CenterView = 'ladder' | 'tags' | 'watch' | 'dbs' | 'udt' | 'interface' | 'instances' | 'xref' | 'hmi'

export interface UiState {
  activeBlockId?: string
  activeNetworkId?: string
  activeDbId?: string
  activeUdtId?: string
  selectedNodeId?: string
  editingNodeId?: string
  editingParam?: string
  clipboard?: LadderNode
  zoom: number
  panX: number
  panY: number
  leftTab: LeftPanelTab
  rightTab: RightPanelTab
  bottomTab: BottomPanelTab
  bottomOpen: boolean
  centerView: CenterView
  /** 插入模式：从调色板点击指令后待放置。 */
  pendingInstructionId?: string
  statusMessage?: string

  setActiveBlock: (blockId: string, networkId?: string) => void
  setActiveNetwork: (networkId: string) => void
  setActiveDb: (dbId?: string) => void
  setActiveUdt: (udtId?: string) => void
  selectNode: (nodeId?: string) => void
  startEditing: (nodeId?: string, param?: string) => void
  setClipboard: (node?: LadderNode) => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  setLeftTab: (tab: LeftPanelTab) => void
  setRightTab: (tab: RightPanelTab) => void
  setBottomTab: (tab: BottomPanelTab) => void
  setBottomOpen: (open: boolean) => void
  setPendingInstruction: (id?: string) => void
  setStatusMessage: (message?: string) => void
  setCenterView: (view: CenterView) => void
}

export const useUiStore = create<UiState>()((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  leftTab: 'project',
  rightTab: 'properties',
  bottomTab: 'problems',
  bottomOpen: true,
  centerView: 'ladder',

  setActiveBlock: (blockId, networkId) => set({ activeBlockId: blockId, activeNetworkId: networkId, centerView: 'ladder' }),
  setActiveNetwork: (networkId) => set({ activeNetworkId: networkId, selectedNodeId: undefined }),
  setActiveDb: (activeDbId) => set({ activeDbId, centerView: 'dbs' }),
  setActiveUdt: (activeUdtId) => set({ activeUdtId, centerView: 'udt' }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  startEditing: (nodeId, param) => set({ editingNodeId: nodeId, editingParam: param }),
  setClipboard: (node) => set({ clipboard: node }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setRightTab: (rightTab) => set({ rightTab }),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomOpen: true }),
  setBottomOpen: (bottomOpen) => set({ bottomOpen }),
  setPendingInstruction: (pendingInstructionId) => set({ pendingInstructionId }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setCenterView: (centerView) => set({ centerView }),
}))
