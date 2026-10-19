import { memo } from 'react'
import { getInstruction } from '@/domain/catalog'
import { formatOperand, operandKey } from '@/domain/operand'
import type { BoxNode, CallNode, CoilNode, ContactNode, Operand, Project } from '@/domain/types'
import { useSimulationStore } from '@/store/simulationStore'
import { formatLiteral, formatTime } from '@/domain/values'
import { usePowered } from './usePowered'

export interface ElementProps {
  project: Project
  selected: boolean
  /** 稳定的回调：传入节点 id，避免每次渲染新建闭包让 memo 失效。 */
  onSelect: (nodeId: string) => void
  onStartEdit: (nodeId: string, param?: string) => void
}

const ON = 'var(--color-power)'
const OFF = '#111827'

/** 订阅某个操作数的在线值（只有该值变化时才重渲染）。 */
function useLiveValue(operand: Operand | undefined): boolean | number | undefined {
  const key = operand && operand.kind !== 'literal' ? operandKey(operand) : undefined
  return useSimulationStore((state) => (key === undefined ? undefined : state.values[key]))
}

export const ContactElement = memo(function ContactElement({
  node,
  project,
  selected,
  onSelect,
  onStartEdit,
}: ElementProps & { node: ContactNode }) {
  const label = formatOperand(project, node.operand)
  const powered = usePowered(node.id, 'out')
  const color = powered ? ON : OFF
  const showEdge = node.variant === 'P' || node.variant === 'N'
  return (
    <div
      className={`ladder-element contact-box ${selected ? 'selected' : ''} ${powered ? 'on' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onStartEdit(node.id)
      }}
    >
      <svg viewBox="0 0 80 40" preserveAspectRatio="none" className="h-9 w-full">
        <line x1="0" y1="20" x2="28" y2="20" stroke={color} strokeWidth="2" />
        <line x1="28" y1="6" x2="28" y2="34" stroke={color} strokeWidth="2" />
        <line x1="52" y1="6" x2="52" y2="34" stroke={color} strokeWidth="2" />
        <line x1="52" y1="20" x2="80" y2="20" stroke={color} strokeWidth="2" />
        {node.variant === 'NC' && <line x1="20" y1="34" x2="60" y2="6" stroke={color} strokeWidth="2" />}
        {showEdge && (
          <text x="40" y="14" textAnchor="middle" fontSize="11" fill={color} fontWeight="600">
            {node.variant}
          </text>
        )}
      </svg>
      <span className={`operand-label ${powered ? 'value' : ''}`}>{label || '未填写'}</span>
    </div>
  )
})

export const CoilElement = memo(function CoilElement({
  node,
  project,
  selected,
  onSelect,
  onStartEdit,
}: ElementProps & { node: CoilNode }) {
  const label = formatOperand(project, node.operand)
  const powered = usePowered(node.id, 'out')
  const color = powered ? ON : OFF
  const marker =
    node.variant === 'SET' ? 'S' : node.variant === 'RESET' ? 'R' : node.variant === 'EDGE_P' ? 'P' : node.variant === 'EDGE_N' ? 'N' : ''
  return (
    <div
      className={`ladder-element coil-box ${selected ? 'selected' : ''} ${powered ? 'on' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onStartEdit(node.id)
      }}
    >
      <svg viewBox="0 0 80 40" preserveAspectRatio="none" className="h-9 w-full">
        <line x1="0" y1="20" x2="26" y2="20" stroke={color} strokeWidth="2" />
        <path d="M26,6 Q38,20 26,34" fill="none" stroke={color} strokeWidth="2" />
        <path d="M54,6 Q42,20 54,34" fill="none" stroke={color} strokeWidth="2" />
        <line x1="54" y1="20" x2="80" y2="20" stroke={color} strokeWidth="2" />
        {node.variant === 'COIL_NEG' && <line x1="16" y1="34" x2="64" y2="6" stroke={color} strokeWidth="2" />}
        {marker && (
          <text x="40" y="14" textAnchor="middle" fontSize="11" fill={color} fontWeight="600">
            {marker}
          </text>
        )}
      </svg>
      <span className={`operand-label ${powered ? 'value' : ''}`}>{label || '未填写'}</span>
    </div>
  )
})

export const BoxElement = memo(function BoxElement({
  node,
  project,
  selected,
  onSelect,
  onStartEdit,
}: ElementProps & { node: BoxNode }) {
  const def = getInstruction(node.instructionId)
  const powered = usePowered(node.id, 'out')
  return (
    <div
      className={`ladder-element ${selected ? 'selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
    >
      <div className={`box-element ${powered ? 'on' : ''}`}>
        <div className="box-title">
          {node.label && (def?.handler === 'JMP' || def?.handler === 'LABEL') ? `${def.label} · ${node.label}` : (def?.label ?? node.instructionId)}
        </div>
        <div className="box-body">
          {(def?.params ?? []).map((spec) => (
            <BoxParamRow
              key={spec.name}
              label={spec.label}
              operand={node.params[spec.name]}
              project={project}
              emptyText={spec.direction === 'output' ? '—' : '未填写'}
              onStartEdit={() => onStartEdit(node.id, spec.name)}
            />
          ))}
          <BoxLiveState nodeId={node.id} />
        </div>
      </div>
    </div>
  )
})

/** 参数行：独立订阅该操作数的在线值，避免整框因任意值变化重渲染。 */
const BoxParamRow = memo(function BoxParamRow({
  label,
  operand,
  project,
  emptyText,
  onStartEdit,
}: {
  label: string
  operand: Operand | undefined
  project: Project
  emptyText: string
  onStartEdit: () => void
}) {
  const live = useLiveValue(operand)
  let display = operand ? formatOperand(project, operand) : ''
  if (live !== undefined) display = typeof live === 'boolean' ? formatLiteral(live, 'BOOL') : String(live)
  return (
    <div
      className={`box-param ${operand ? '' : 'empty'}`}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onStartEdit()
      }}
    >
      <span className="pname">{label}</span>
      <span className="pvalue">{display || emptyText}</span>
    </div>
  )
})

/** 定时器/计数器的 Q / ET / CV 在线状态（按标量订阅）。 */
const BoxLiveState = memo(function BoxLiveState({ nodeId }: { nodeId: string }) {
  const q = useSimulationStore((state) => state.boxStates[nodeId]?.q)
  const et = useSimulationStore((state) => state.boxStates[nodeId]?.et)
  const cv = useSimulationStore((state) => state.boxStates[nodeId]?.cv)
  if (q === undefined && et === undefined && cv === undefined) return null
  return (
    <>
      {q !== undefined && (
        <div className="box-param">
          <span className="pname">Q</span>
          <span className="pvalue">{q ? 'TRUE' : 'FALSE'}</span>
        </div>
      )}
      {et !== undefined && (
        <div className="box-param">
          <span className="pname">ET</span>
          <span className="pvalue">{formatTime(et)}</span>
        </div>
      )}
      {cv !== undefined && (
        <div className="box-param">
          <span className="pname">CV</span>
          <span className="pvalue">{cv}</span>
        </div>
      )}
    </>
  )
})

export const CallElement = memo(function CallElement({
  node,
  project,
  selected,
  onSelect,
  onStartEdit,
}: ElementProps & { node: CallNode }) {
  const block = project.blocks.find((item) => item.id === node.blockId)
  const instance = node.instanceDbId ? project.dataBlocks.find((item) => item.id === node.instanceDbId) : undefined
  const powered = usePowered(node.id, 'out')
  const params = block
    ? [...block.interface.inputs, ...block.interface.outputs, ...block.interface.inOuts].map((variable) => ({ variable }))
    : []
  return (
    <div
      className={`ladder-element ${selected ? 'selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(node.id)
      }}
    >
      <div className={`box-element ${powered ? 'on' : ''}`}>
        <div className="box-title">
          {block ? `${block.name}${block.kind === 'FB' && instance ? ` · ${instance.name}` : ''}` : '⟨已删除的块⟩'}
        </div>
        <div className="box-body">
          {params.map(({ variable }) => (
            <BoxParamRow
              key={variable.id}
              label={variable.name}
              operand={node.bindings[variable.name]}
              project={project}
              emptyText="未连接"
              onStartEdit={() => onStartEdit(node.id, variable.name)}
            />
          ))}
          {params.length === 0 && <div className="box-param empty"><span className="pvalue">无参数</span></div>}
        </div>
      </div>
    </div>
  )
})

export const EmptySlotElement = memo(function EmptySlotElement({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`ladder-element ${selected ? 'selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
    >
      <div className="empty-slot">空</div>
    </div>
  )
})
