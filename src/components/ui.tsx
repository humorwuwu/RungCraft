import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div className={clsx('flex min-h-0 min-w-0 flex-col bg-panel', className)}>
      {title !== undefined && (
        <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-panel-alt px-2 text-[12px] font-semibold text-dim">
          <span className="truncate">{title}</span>
          {actions && <span className="flex items-center gap-1">{actions}</span>}
        </div>
      )}
      <div className={clsx('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>
    </div>
  )
}

export function ToolButton({
  label,
  icon,
  active,
  disabled,
  title,
  onClick,
  className,
}: {
  label?: ReactNode
  icon?: ReactNode
  active?: boolean
  disabled?: boolean
  title?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx('tool-btn', active && 'active', className)}
    >
      {icon}
      {label !== undefined && <span>{label}</span>}
    </button>
  )
}

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-panel-alt px-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            'h-7 rounded-t border border-b-0 px-3 text-[12px]',
            value === tab.id
              ? 'border-border bg-panel font-semibold text-accent'
              : 'border-transparent text-dim hover:text-text',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded border border-border bg-panel shadow-2xl"
          style={{ width }}
        >
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-border bg-panel-alt px-3 text-[13px] font-semibold">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="rounded px-1 text-dim hover:bg-panel-sunken hover:text-text">✕</Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
          {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border px-3 py-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-2 flex items-center gap-2 text-[12px]">
      <span className="w-20 shrink-0 text-dim">{label}</span>
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
      </span>
    </label>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'h-6 rounded border px-3 text-[12px]',
        variant === 'primary' && 'border-accent-strong bg-accent text-white hover:bg-accent-strong',
        variant === 'danger' && 'border-error bg-error text-white hover:opacity-90',
        variant === 'default' && 'border-border bg-panel-alt hover:bg-accent-soft',
        disabled && 'cursor-default opacity-40',
      )}
    >
      {children}
    </button>
  )
}
