import { useState } from 'react'
import { ClipboardPaste, Copy, GitBranch, Redo2, RefreshCw, Trash2, Undo2, X } from 'lucide-react'
import { getInstruction } from '@/domain/catalog'
import type { Project } from '@/domain/types'
import { useProjectStore } from '@/store/projectStore'
import { useSimulationStore } from '@/store/simulationStore'
import { useUiStore } from '@/store/uiStore'
import { copyNode, deleteNode, insertInstruction, pasteNode, updateNetworkMeta } from '@/store/editorActions'
import { compileAndDownload } from '@/features/simulation/actions'
import { ToolButton } from '@/components/ui'
import { TextInput } from '@/components/TextInput'
import { CallDialog } from './CallDialog'
import { LadderCanvas } from './LadderCanvas'

export function NetworkEditor({ blockId, networkId, project }: { blockId: string; networkId: string; project: Project }) {
  const block = project.blocks.find((item) => item.id === blockId)
  const networkIndex = block?.networks.findIndex((item) => item.id === networkId) ?? -1
  const network = networkIndex >= 0 ? block?.networks[networkIndex] : undefined
  const selectedNodeId = useUiStore((state) => state.selectedNodeId)
  const clipboard = useUiStore((state) => state.clipboard)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const pendingInstructionId = useUiStore((state) => state.pendingInstructionId)
  const setPendingInstruction = useUiStore((state) => state.setPendingInstruction)
  const revision = useProjectStore((state) => state.revision)
  const downloadedRevision = useSimulationStore((state) => state.downloadedRevision)
  const [callDialogOpen, setCallDialogOpen] = useState(false)

  if (!block || !network) {
    return <div className="flex h-full items-center justify-center text-dim">请选择网络。</div>
  }

  const insert = (instructionId: string, mode: 'series' | 'parallel' = 'series') => {
    insertInstruction(blockId, networkId, instructionId, selectedNodeId ? { nodeId: selectedNodeId, position: 'after', mode } : undefined)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-panel-alt px-3 py-1.5">
        <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">网络 {networkIndex + 1}</span>
        <TextInput
          className="field-input max-w-72"
          value={network.title}
          placeholder="网络标题"
          onCommit={(value) => updateNetworkMeta(blockId, networkId, { title: value })}
        />
        <TextInput
          className="field-input max-w-96 flex-1"
          value={network.comment}
          placeholder="网络注释"
          onCommit={(value) => updateNetworkMeta(blockId, networkId, { comment: value })}
        />
        {downloadedRevision !== undefined && downloadedRevision !== revision && (
          <button
            type="button"
            data-testid="resync-banner"
            className="ml-auto flex shrink-0 items-center gap-1 rounded border border-warn px-2 py-0.5 text-[11px] font-semibold text-warn hover:bg-warn/10"
            title="当前运行的仍是上一版程序；点击重新编译并下载"
            onClick={() => compileAndDownload(project)}
          >
            <RefreshCw size={11} />工程已修改，需重新编译
          </button>
        )}
      </div>

      {pendingInstructionId && (
        <div
          data-testid="insert-banner"
          className="flex shrink-0 items-center gap-2 border-b border-accent bg-accent-soft px-3 py-1 text-[12px] text-accent"
        >
          <span>
            正在放置「{getInstruction(pendingInstructionId)?.label ?? pendingInstructionId}」：点击画布放置，按住 Shift 拖放可插入并联分支。
          </span>
          <button type="button" className="ml-auto flex items-center gap-1 text-[11px] hover:underline" onClick={() => setPendingInstruction(undefined)}>
            <X size={11} />取消（Esc）
          </button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-panel px-2 py-1">
        <ToolButton label="常开" title="插入常开触点" onClick={() => insert('contact.NO')} />
        <ToolButton label="常闭" title="插入常闭触点" onClick={() => insert('contact.NC')} />
        <ToolButton label="线圈" title="插入线圈" onClick={() => insert('coil.COIL')} />
        <ToolButton label="置位" title="插入置位线圈" onClick={() => insert('coil.SET')} />
        <ToolButton label="复位" title="插入复位线圈" onClick={() => insert('coil.RESET')} />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolButton label="TON" title="插入接通延时定时器" onClick={() => insert('box.TON')} />
        <ToolButton label="TOF" title="插入断开延时定时器" onClick={() => insert('box.TOF')} />
        <ToolButton label="CTU" title="插入加计数器" onClick={() => insert('box.CTU')} />
        <ToolButton label="调用块" title="插入 FC/FB 调用" onClick={() => setCallDialogOpen(true)} />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolButton
          label="并联分支"
          icon={<GitBranch size={13} />}
          title="在选中元素旁插入并联分支（Shift+拖放也可）"
          onClick={() => insert('contact.NO', 'parallel')}
        />
        <ToolButton
          label="删除"
          icon={<Trash2 size={13} />}
          title="删除选中元素"
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && deleteNode(blockId, networkId, selectedNodeId)}
        />
        <ToolButton
          label="复制"
          icon={<Copy size={13} />}
          disabled={!selectedNodeId}
          onClick={() => selectedNodeId && copyNode(blockId, networkId, selectedNodeId)}
        />
        <ToolButton
          label="粘贴"
          icon={<ClipboardPaste size={13} />}
          disabled={!clipboard}
          onClick={() => pasteNode(blockId, networkId, selectedNodeId ? { nodeId: selectedNodeId, position: 'after' } : undefined)}
        />
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolButton label="撤销" icon={<Undo2 size={13} />} disabled={!canUndo} onClick={undo} />
        <ToolButton label="重做" icon={<Redo2 size={13} />} disabled={!canRedo} onClick={redo} />
      </div>

      <div className="min-h-0 flex-1">
        <LadderCanvas blockId={blockId} network={network} project={project} />
      </div>
      <CallDialog open={callDialogOpen} onClose={() => setCallDialogOpen(false)} project={project} blockId={blockId} networkId={networkId} />
    </div>
  )
}
