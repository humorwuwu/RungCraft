import { create } from 'zustand'
import { newId } from '@/domain/ids'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  level: NotificationLevel
  message: string
  /** 详情行，例如导入失败时的字段级错误。 */
  details?: string[]
  createdAt: number
}

export interface ConfirmRequest {
  id: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

interface NotificationState {
  notifications: Notification[]
  confirm?: ConfirmRequest
  push: (level: NotificationLevel, message: string, details?: string[]) => string
  dismiss: (id: string) => void
  clear: () => void
  requestConfirm: (request: Omit<ConfirmRequest, 'id' | 'resolve'>) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],

  push: (level, message, details) => {
    const id = newId('toast')
    set((state) => ({
      // 同类消息只保留最新一条，避免刷屏。
      notifications: [...state.notifications.filter((item) => !(item.message === message && item.level === level)), { id, level, message, details, createdAt: Date.now() }].slice(-4),
    }))
    return id
  },

  dismiss: (id) => set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) })),
  clear: () => set({ notifications: [] }),

  requestConfirm: (request) =>
    new Promise<boolean>((resolve) => {
      const previous = get().confirm
      previous?.resolve(false)
      set({ confirm: { ...request, id: newId('confirm'), resolve } })
    }),

  resolveConfirm: (ok) => {
    const current = get().confirm
    set({ confirm: undefined })
    current?.resolve(ok)
  },
}))

/** 快捷方法：非阻断式提示，替代 window.alert。 */
export function notify(message: string, level: NotificationLevel = 'info', details?: string[]): string {
  return useNotificationStore.getState().push(level, message, details)
}

/** 快捷方法：阻断式确认，替代 window.confirm。 */
export function confirmAction(
  message: string,
  options: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return useNotificationStore.getState().requestConfirm({
    title: options.title ?? '请确认',
    message,
    confirmLabel: options.confirmLabel ?? '确定',
    cancelLabel: options.cancelLabel ?? '取消',
    danger: options.danger ?? false,
  })
}
