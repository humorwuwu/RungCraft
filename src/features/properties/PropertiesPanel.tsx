import type { ReactNode } from 'react'
import { getInstruction } from '@/domain/catalog'
import { findNodePath, getNodeAt } from '@/domain/ladderOps'
import { formatOperand } from '@/domain/operand'
import { findTagById } from '@/domain/projectIndex'
import type { CoilVariant, ContactVariant, Project } from '@/domain/types'
import { useUiStore } from '@/store/uiStore'
import { setBoxLabel, setCoilVariant, setContactVariant } from '@/store/editorActions'

export function PropertiesPanel({ project }: { project: Project }) {
  const blockId = useUiStore((state) => state.activeBlockId)
  const networkId = useUiStore((state) => state.activeNetworkId)
  const selectedNodeId = useUiStore((state) => state.selectedNodeId)
  const startEditing = useUiStore((state) => state.startEditing)

  const block = project.blocks.find((item) => item.id === blockId)
  const network = block?.networks.find((item) => item.id === networkId)
  const node = network && selectedNodeId ? getNodeAt(network.root, findNodePath(network.root, selectedNodeId) ?? []) : undefined

  if (!network) return <Empty text="未选择网络" />
  if (!node) return <Empty text="在画布中选择一个元素以编辑属性" />

  if (node.kind === 'contact' || node.kind === 'coil') {
    const tag = node.operand.kind === 'tag' ? findTagById(project, node.operand.tagId) : undefined
    const variants: Array<{ id: ContactVariant | CoilVariant; label: string }> =
      node.kind === 'contact'
        ? [
            { id: 'NO', label: '常开' },
            { id: 'NC', label: '常闭' },
            { id: 'P', label: '上升沿' },
            { id: 'N', label: '下降沿' },
          ]
        : [
            { id: 'COIL', label: '线圈' },
            { id: 'COIL_NEG', label: '取反' },
            { id: 'SET', label: '置位' },
            { id: 'RESET', label: '复位' },
            { id: 'EDGE_P', label: '上升沿' },
            { id: 'EDGE_N', label: '下降沿' },
          ]
    return (
      <div className="p-2 text-[12px]">
        <SectionTitle>{node.kind === 'contact' ? '触点' : '线圈'}</SectionTitle>
        <div className="mb-2 flex flex-wrap gap-1">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className={`rounded border px-2 py-0.5 ${
                node.variant === variant.id ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:bg-panel-alt'
              }`}
              onClick={() =>
                node.kind === 'contact'
                  ? setContactVariant(blockId!, networkId!, node.id, variant.id as ContactVariant)
                  : setCoilVariant(blockId!, networkId!, node.id, variant.id as CoilVariant)
              }
            >
              {variant.label}
            </button>
          ))}
        </div>
        <SectionTitle>操作数</SectionTitle>
        <button
          type="button"
          className="mb-1 w-full rounded border border-border bg-panel-alt px-2 py-1 text-left hover:border-accent"
          onClick={() => startEditing(node.id)}
        >
          <span className="mono">{formatOperand(project, node.operand) || '未填写'}</span>
        </button>
        {tag && (
          <div className="text-[11px] text-faint">
            地址：<span className="mono">{tag.address ?? '自动分配'}</span> · 类型：{tag.dataType.kind === 'base' ? tag.dataType.type : '复杂类型'}
          </div>
        )}
        <div className="mt-3 text-[11px] text-faint">提示：在画布上双击元素也可以直接编辑操作数。</div>
      </div>
    )
  }

  if (node.kind !== 'box') return <Empty text="选择触点、线圈或功能框以编辑属性" />

  const def = getInstruction(node.instructionId)
  return (
    <div className="p-2 text-[12px]">
      <SectionTitle>{def?.label ?? node.instructionId}</SectionTitle>
      <p className="mb-2 text-[11px] text-dim">{def?.description}</p>
      {(def?.handler === 'JMP' || def?.handler === 'LABEL') && (
        <>
          <SectionTitle>标签名</SectionTitle>
          <input
            className="field-input mono mb-2"
            value={node.label ?? ''}
            placeholder="例如 LOOP"
            onChange={(event) => setBoxLabel(blockId!, networkId!, node.id, event.target.value)}
          />
        </>
      )}
      <SectionTitle>参数</SectionTitle>
      <div className="flex flex-col gap-1">
        {(def?.params ?? []).map((spec) => (
          <button
            key={spec.name}
            type="button"
            className="flex items-center justify-between gap-2 rounded border border-border bg-panel-alt px-2 py-1 text-left hover:border-accent"
            onClick={() => startEditing(node.id, spec.name)}
          >
            <span className="text-dim">
              {spec.label}
              <span className="ml-1 text-[10px] text-faint">{spec.direction === 'output' ? '输出' : '输入'}</span>
            </span>
            <span className="mono truncate text-accent">{formatOperand(project, node.params[spec.name]) || '未填写'}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-faint">
        指令 ID：<span className="mono">{node.instructionId}</span>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-faint first:mt-0">{children}</div>
}

function Empty({ text }: { text: string }) {
  return <div className="p-3 text-[12px] text-faint">{text}</div>
}
