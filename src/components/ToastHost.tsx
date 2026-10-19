import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useNotificationStore, type NotificationLevel } from '@/store/notificationStore'
import { Button, Modal } from '@/components/ui'

const LEVEL_STYLE: Record<NotificationLevel, { icon: typeof Info; className: string; autoMs: number }> = {
  info: { icon: Info, className: 'border-border text-text', autoMs: 4000 },
  success: { icon: CheckCircle2, className: 'border-accent text-text', autoMs: 3000 },
  warning: { icon: AlertTriangle, className: 'border-warn text-text', autoMs: 6000 },
  error: { icon: XCircle, className: 'border-error text-text', autoMs: 0 },
}

/** 全局提示与确认对话框宿主，挂在应用根部一次即可。 */
export function ToastHost() {
  const notifications = useNotificationStore((state) => state.notifications)
  const dismiss = useNotificationStore((state) => state.dismiss)
  const confirm = useNotificationStore((state) => state.confirm)
  const resolveConfirm = useNotificationStore((state) => state.resolveConfirm)

  // 自动消失；错误提示保留到用户手动关闭。
  useEffect(() => {
    const timers = notifications
      .filter((item) => LEVEL_STYLE[item.level].autoMs > 0)
      .map((item) =>
        window.setTimeout(() => dismiss(item.id), LEVEL_STYLE[item.level].autoMs),
      )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [notifications, dismiss])

  return (
    <>
      <div className="pointer-events-none fixed bottom-8 right-3 z-[60] flex w-80 flex-col gap-1.5">
        {notifications.map((item) => {
          const style = LEVEL_STYLE[item.level]
          const Icon = style.icon
          return (
            <div
              key={item.id}
              role="status"
              data-testid="toast"
              className={clsx('pointer-events-auto rounded border bg-panel px-2 py-1.5 text-[12px] shadow-xl', style.className)}
            >
              <div className="flex items-start gap-1.5">
                <Icon size={13} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{item.message}</span>
                <button type="button" className="shrink-0 text-faint hover:text-text" title="关闭" onClick={() => dismiss(item.id)}>
                  <X size={12} />
                </button>
              </div>
              {item.details && item.details.length > 0 && (
                <ul className="mt-1 max-h-24 list-disc overflow-auto pl-5 text-[11px] text-dim">
                  {item.details.slice(0, 8).map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <Modal
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        width={420}
        onClose={() => resolveConfirm(false)}
        footer={
          <>
            <Button onClick={() => resolveConfirm(false)}>{confirm?.cancelLabel ?? '取消'}</Button>
            <Button variant={confirm?.danger ? 'danger' : 'primary'} onClick={() => resolveConfirm(true)}>
              {confirm?.confirmLabel ?? '确定'}
            </Button>
          </>
        }
      >
        <div className="text-[12px] leading-relaxed">{confirm?.message}</div>
      </Modal>
    </>
  )
}
