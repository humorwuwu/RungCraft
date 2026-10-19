import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Download, FilePlus2, Upload } from 'lucide-react'
import { TabBar, ToolButton } from '@/components/ui'
import { ToastHost } from '@/components/ToastHost'
import { WelcomeDialog } from '@/features/welcome/WelcomeDialog'
import { TextInput } from '@/components/TextInput'
import { confirmAction, notify } from '@/store/notificationStore'
import { runSimulation, stopSimulation } from '@/features/simulation/actions'
import { saveProject } from '@/persistence/db'
import { createProject } from '@/domain/project'
import { findSample, SAMPLES } from '@/domain/samples'
import type { Project } from '@/domain/types'
import { useProjectStore } from '@/store/projectStore'
import { useSimulationStore } from '@/store/simulationStore'
import { useUiStore, type BottomPanelTab, type CenterView, type LeftPanelTab, type RightPanelTab } from '@/store/uiStore'
import { copyNode, deleteNode, pasteNode } from '@/store/editorActions'
import { ProjectTree } from '@/features/project-tree/ProjectTree'
import { InstructionPalette } from '@/features/instruction-palette/InstructionPalette'
import { NetworkEditor } from '@/features/ladder/NetworkEditor'
import { TagTablePanel } from '@/features/tag-table/TagTablePanel'
import { DataBlockPanel } from '@/features/data-blocks/DataBlockPanel'
import { UdtPanel } from '@/features/udt/UdtPanel'
import { BlockInterfacePanel } from '@/features/blocks/BlockInterfacePanel'
import { InstanceMonitorPanel } from '@/features/blocks/InstanceMonitorPanel'
import { CrossReferencePanel } from '@/features/cross-reference/CrossReferencePanel'
import { WatchTablePanel } from '@/features/watch-table/WatchTablePanel'
import { IoPanel } from '@/features/io-panel/IoPanel'
import { ProblemsPanel } from '@/features/problems/ProblemsPanel'
import { PropertiesPanel } from '@/features/properties/PropertiesPanel'
import { SimToolbar } from '@/features/simulation/SimToolbar'
import { getLastProjectId, loadProject } from '@/persistence/db'
import { exportProjectFile, parseProjectFile } from '@/persistence/serialize'
import { useAutosave } from '@/persistence/useAutosave'
import { simClient } from '@/workers/simClient'

export default function App() {
  const project = useProjectStore((state) => state.project)
  const dirty = useProjectStore((state) => state.dirty)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)
  const replaceProject = useProjectStore((state) => state.replaceProject)
  const update = useProjectStore((state) => state.update)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const markSaved = useProjectStore((state) => state.markSaved)
  const activeBlockId = useUiStore((state) => state.activeBlockId)
  const activeNetworkId = useUiStore((state) => state.activeNetworkId)
  const selectedNodeId = useUiStore((state) => state.selectedNodeId)
  const leftTab = useUiStore((state) => state.leftTab)
  const rightTab = useUiStore((state) => state.rightTab)
  const bottomTab = useUiStore((state) => state.bottomTab)
  const bottomOpen = useUiStore((state) => state.bottomOpen)
  const centerView = useUiStore((state) => state.centerView)
  const setLeftTab = useUiStore((state) => state.setLeftTab)
  const setRightTab = useUiStore((state) => state.setRightTab)
  const setBottomTab = useUiStore((state) => state.setBottomTab)
  const setBottomOpen = useUiStore((state) => state.setBottomOpen)
  const setCenterView = useUiStore((state) => state.setCenterView)
  const setActiveBlock = useUiStore((state) => state.setActiveBlock)
  const setPendingInstruction = useUiStore((state) => state.setPendingInstruction)
  const startEditing = useUiStore((state) => state.startEditing)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useAutosave()

  const saveNow = () => {
    void (async () => {
      try {
        await saveProject(project)
        markSaved()
        notify('工程已保存到本地。', 'success')
      } catch (error) {
        notify(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    })()
  }

  // 有未保存改动时离开页面给出提示（自动保存有 800ms 防抖窗口）。
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // 首次启动：连接仿真 Worker，并尝试恢复上次工程。
  useEffect(() => {
    simClient.connect()
    void (async () => {
      const lastId = await getLastProjectId()
      if (!lastId) {
        // 首次启动（本地没有工程）时给出选择，而不是直接塞一个示例。
        setWelcomeOpen(true)
        return
      }
      const stored = await loadProject(lastId)
      if (stored) replaceProject(stored, { markClean: true })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 保证始终有激活的块和网络。
  useEffect(() => {
    const block = project.blocks.find((item) => item.id === activeBlockId) ?? project.blocks[0]
    if (!block) return
    const network = block.networks.find((item) => item.id === activeNetworkId) ?? block.networks[0]
    if (!network) return
    if (block.id !== activeBlockId || network.id !== activeNetworkId) {
      setActiveBlock(block.id, network.id)
    }
  }, [project, activeBlockId, activeNetworkId, setActiveBlock])

  // 快捷键
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editing = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }
      if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault()
        redo()
        return
      }
      if (event.key === 'Escape') {
        // 取消插入模式与内联编辑。
        setPendingInstruction(undefined)
        startEditing(undefined)
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveNow()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        if (event.shiftKey) stopSimulation()
        else runSimulation()
        return
      }
      if (editing) return
      if (mod && event.key.toLowerCase() === 'x') {
        if (selectedNodeId && activeBlockId && activeNetworkId) {
          copyNode(activeBlockId, activeNetworkId, selectedNodeId)
          deleteNode(activeBlockId, activeNetworkId, selectedNodeId)
        }
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodeId && activeBlockId && activeNetworkId) {
          event.preventDefault()
          deleteNode(activeBlockId, activeNetworkId, selectedNodeId)
        }
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        if (selectedNodeId && activeBlockId && activeNetworkId) copyNode(activeBlockId, activeNetworkId, selectedNodeId)
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        if (activeBlockId && activeNetworkId) {
          pasteNode(activeBlockId, activeNetworkId, selectedNodeId ? { nodeId: selectedNodeId, position: 'after' } : undefined)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBlockId, activeNetworkId, selectedNodeId, undo, redo, dirty, project])

  /** 仅在用户确实做过编辑时提示“会丢失改动”，刚载入的工程不打扰。 */
  const confirmDiscard = async (message: string, title: string, confirmLabel: string): Promise<boolean> => {
    const state = useProjectStore.getState()
    if (!state.dirty || state.past.length === 0) return true
    return confirmAction(message, { title, confirmLabel })
  }

  const loadProjectIntoEditor = (next: Project) => {
    replaceProject(next)
    setActiveBlock(next.blocks[0].id, next.blocks[0].networks[0].id)
    setCenterView('ladder')
  }

  const handleNew = async () => {
    if (!(await confirmDiscard('当前工程尚未保存，新建会清空撤销历史。确定新建吗？', '新建工程', '新建'))) return
    loadProjectIntoEditor(createProject())
  }

  const handleExport = () => {
    const blob = new Blob([exportProjectFile(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${project.name || 'project'}.ladproj.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const result = parseProjectFile(text)
    if (!result.ok) {
      notify('导入失败：工程文件校验未通过。', 'error', result.errors)
      return
    }
    replaceProject(result.project)
    setActiveBlock(result.project.blocks[0]?.id ?? '', result.project.blocks[0]?.networks[0]?.id)
    notify(`已导入工程「${result.project.name}」。`, 'success')
  }

  const blockId = activeBlockId ?? project.blocks[0]?.id ?? ''
  const block = project.blocks.find((item) => item.id === blockId)
  const networkId = activeNetworkId ?? block?.networks[0]?.id ?? ''
  const mode = useSimulationStore((state) => state.mode)

  return (
    <div className="flex h-full flex-col bg-app text-text">
      <header className="flex shrink-0 flex-col border-b border-border bg-panel">
        <div className="flex h-8 items-center gap-2 px-2">
          <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[13px] font-semibold text-accent">RungCraft</span>
            <span className="text-[11px] text-dim">梯形图编辑器</span>
          </span>
          <TextInput
            className="field-input h-6 max-w-64"
            value={project.name}
            onCommit={(value) =>
              update((draft) => {
                draft.name = value
              }, '重命名工程', { coalesceKey: 'project-name' })
            }
          />
          <ToolButton label="新建" icon={<FilePlus2 size={13} />} onClick={handleNew} />
          <select
            className="field-input h-6 w-36"
            value=""
            data-testid="sample-select"
            onChange={(event) => {
              const value = event.target.value
              if (!value) return
              const sample = findSample(value)
              if (!sample) return
              void (async () => {
                if (!(await confirmDiscard('当前工程尚未保存，载入示例会清空撤销历史。确定继续吗？', '载入示例', '载入'))) return
                loadProjectIntoEditor(sample.create())
                notify(`已载入示例「${sample.name}」。`, 'success')
              })()
            }}
          >
            <option value="">载入示例…</option>
            {SAMPLES.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.name}
              </option>
            ))}
          </select>
          <ToolButton label="导入" icon={<Upload size={13} />} onClick={() => fileInputRef.current?.click()} />
          <ToolButton label="导出" icon={<Download size={13} />} onClick={handleExport} />
          <span className="ml-auto text-[11px] text-faint">{dirty ? '未保存…' : lastSavedAt ? '已自动保存' : '就绪'}</span>
        </div>
        <div className="flex h-9 items-center gap-1 border-t border-border bg-panel-alt px-2">
          <SimToolbar project={project} />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel defaultSize="18%" minSize="12%">
            <div className="flex h-full min-h-0 flex-col border-r border-border bg-panel">
              <TabBar<LeftPanelTab>
                tabs={[
                  { id: 'project', label: '项目树' },
                  { id: 'palette', label: '指令' },
                ]}
                value={leftTab}
                onChange={setLeftTab}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                {leftTab === 'project' ? <ProjectTree project={project} /> : <InstructionPalette />}
              </div>
            </div>
          </Panel>
          <Separator className="w-1 bg-border hover:bg-accent" />
          <Panel defaultSize="62%" minSize="30%">
            <Group orientation="vertical">
              <Panel defaultSize="72%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col bg-panel">
                  <TabBar<CenterView>
                    tabs={[
                      { id: 'ladder', label: '梯形图' },
                      { id: 'tags', label: '变量表' },
                      { id: 'dbs', label: '数据块' },
                      { id: 'udt', label: '数据类型' },
                      { id: 'interface', label: '块接口' },
                      { id: 'instances', label: '实例监视' },
                      { id: 'xref', label: '交叉引用' },
                      { id: 'watch', label: '监视表' },
                    ]}
                    value={centerView}
                    onChange={setCenterView}
                  />
                  <div className="min-h-0 flex-1">
                    {centerView === 'ladder' && blockId && networkId && (
                      <NetworkEditor blockId={blockId} networkId={networkId} project={project} />
                    )}
                    {centerView === 'tags' && <TagTablePanel project={project} />}
                    {centerView === 'dbs' && <DataBlockPanel project={project} />}
                    {centerView === 'udt' && <UdtPanel project={project} />}
                    {centerView === 'interface' && <BlockInterfacePanel project={project} />}
                    {centerView === 'instances' && <InstanceMonitorPanel project={project} />}
                    {centerView === 'xref' && <CrossReferencePanel project={project} />}
                    {centerView === 'watch' && <WatchTablePanel project={project} />}
                  </div>
                </div>
              </Panel>
              {bottomOpen && (
                <>
                  <Separator className="h-1 bg-border hover:bg-accent" />
                  <Panel defaultSize="28%" minSize="10%">
                    <div className="flex h-full min-h-0 flex-col border-t border-border bg-panel">
                      <div className="flex items-center">
                        <TabBar<BottomPanelTab>
                          tabs={[
                            { id: 'problems', label: '诊断' },
                            { id: 'watch', label: '监视' },
                            { id: 'io', label: 'I/O 面板' },
                          ]}
                          value={bottomTab}
                          onChange={setBottomTab}
                        />
                        <button type="button" className="ml-auto mr-2 text-[11px] text-faint hover:text-text" onClick={() => setBottomOpen(false)}>
                          收起
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        {bottomTab === 'problems' && <ProblemsPanel />}
                        {bottomTab === 'watch' && <WatchTablePanel project={project} />}
                        {bottomTab === 'io' && <IoPanel project={project} />}
                      </div>
                    </div>
                  </Panel>
                </>
              )}
              {!bottomOpen && (
                <div className="flex h-6 shrink-0 items-center justify-end border-t border-border bg-panel-alt pr-2">
                  <button type="button" className="text-[11px] text-faint hover:text-text" onClick={() => setBottomOpen(true)}>
                    展开底部面板
                  </button>
                </div>
              )}
            </Group>
          </Panel>
          <Separator className="w-1 bg-border hover:bg-accent" />
          <Panel defaultSize="20%" minSize="12%">
            <div className="flex h-full min-h-0 flex-col border-l border-border bg-panel">
              <TabBar<RightPanelTab>
                tabs={[
                  { id: 'properties', label: '属性' },
                  { id: 'watch', label: '监视' },
                ]}
                value={rightTab}
                onChange={setRightTab}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                {rightTab === 'properties' ? <PropertiesPanel project={project} /> : <WatchTablePanel project={project} />}
              </div>
            </div>
          </Panel>
        </Group>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-panel-alt px-2 text-[11px] text-dim">
        <span>工程：{project.name}</span>
        <span>块：{project.blocks.length}</span>
        <span>变量：{project.tagTables.reduce((sum, table) => sum + table.tags.length, 0)}</span>
        <span>仿真：{mode === 'running' ? '运行中' : mode === 'paused' ? '已暂停' : '已停止'}</span>
        <span className="ml-auto">本地自动保存 · 无需后端</span>
      </footer>

      <ToastHost />
      <WelcomeDialog
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onCreateBlank={() => {
          loadProjectIntoEditor(createProject())
          setWelcomeOpen(false)
          notify('已新建空白工程。', 'success')
        }}
        onLoadSample={(sample, name) => {
          loadProjectIntoEditor(sample)
          setWelcomeOpen(false)
          notify(`已载入示例「${name}」。`, 'success')
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.ladproj.json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleImportFile(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
