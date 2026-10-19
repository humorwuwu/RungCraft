import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CoilVariant, ContactVariant, LadderNode } from '@/domain/types'

export interface ContextMenuState {
  x: number
  y: number
  nodeId: string
}

export interface ElementContextMenuProps {
  state: ContextMenuState
  node: LadderNode
  canPaste: boolean
  onClose: () => void
  onEditOperand: () => void
  onInsert: (instructionId: string, position: 'before' | 'after', mode: 'series' | 'parallel') => void
  onSetContactVariant: (variant: ContactVariant) => void
  onSetCoilVariant: (variant: CoilVariant) => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

const CONTACT_VARIANTS: Array<{ variant: ContactVariant; label: string }> = [
  { variant: 'NO', label: '常开触点' },
  { variant: 'NC', label: '常闭触点' },
  { variant: 'P', label: '正边沿触点' },
  { variant: 'N', label: '负边沿触点' },
]

const COIL_VARIANTS: Array<{ variant: CoilVariant; label: string }> = [
  { variant: 'COIL', label: '普通线圈' },
  { variant: 'COIL_NEG', label: '取反线圈' },
  { variant: 'SET', label: '置位线圈' },
  { variant: 'RESET', label: '复位线圈' },
  { variant: 'EDGE_P', label: '正边沿线圈' },
  { variant: 'EDGE_N', label: '负边沿线圈' },
]

/** 梯形图元素的右键菜单：插入、切换类型、复制粘贴与删除。 */
export function ElementContextMenu({
  state,
  node,
  canPaste,
  onClose,
  onEditOperand,
  onInsert,
  onSetContactVariant,
  onSetCoilVariant,
  onCopy,
  onPaste,
  onDelete,
}: ElementContextMenuProps) {
  // 菜单贴着鼠标位置弹出，但要夹在视口内，避免靠边的元素把菜单顶到屏幕外。
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: state.x, top: state.y })
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const left = Math.min(state.x, Math.max(4, window.innerWidth - rect.width - 4))
    const top = Math.min(state.y, Math.max(4, window.innerHeight - rect.height - 4))
    setPosition({ left, top })
  }, [state.x, state.y])

  useEffect(() => {
    const close = () => onClose()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const item = (label: string, action: () => void, disabled = false) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      className={`block w-full px-3 py-1 text-left text-[12px] ${
        disabled ? 'cursor-default text-faint' : 'hover:bg-accent-soft'
      }`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => {
        action()
        onClose()
      }}
    >
      {label}
    </button>
  )

  const separator = (key: string) => <div key={key} className="my-1 border-t border-border" />

  return (
    <div
      ref={menuRef}
      data-testid="element-context-menu"
      className="fixed z-50 min-w-52 rounded border border-border bg-panel py-1 shadow-xl"
      style={position}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {item('编辑操作数', onEditOperand)}
      {separator('sep1')}
      {item('在其前插入常开触点', () => onInsert('contact.NO', 'before', 'series'))}
      {item('在其后插入常开触点', () => onInsert('contact.NO', 'after', 'series'))}
      {item('在其后插入常闭触点', () => onInsert('contact.NC', 'after', 'series'))}
      {item('在其后插入线圈', () => onInsert('coil.COIL', 'after', 'series'))}
      {item('插入并联分支（常开）', () => onInsert('contact.NO', 'after', 'parallel'))}
      {item('插入并联分支（常闭）', () => onInsert('contact.NC', 'after', 'parallel'))}
      {node.kind === 'contact' && (
        <>
          {separator('sep2')}
          {CONTACT_VARIANTS.map((option) =>
            item(
              option.variant === node.variant ? `✓ ${option.label}` : `切换为${option.label}`,
              () => onSetContactVariant(option.variant),
            ),
          )}
        </>
      )}
      {node.kind === 'coil' && (
        <>
          {separator('sep2')}
          {COIL_VARIANTS.map((option) =>
            item(
              option.variant === node.variant ? `✓ ${option.label}` : `切换为${option.label}`,
              () => onSetCoilVariant(option.variant),
            ),
          )}
        </>
      )}
      {separator('sep3')}
      {item('复制', onCopy)}
      {item('粘贴到其后', onPaste, !canPaste)}
      {item('删除', onDelete)}
    </div>
  )
}
