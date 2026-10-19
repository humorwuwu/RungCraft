import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string
  /** 提交新值（每次非组字输入、组字结束、失焦时调用）。 */
  onCommit: (value: string) => void
}

/**
 * 受控文本输入，专门处理中文输入法：
 * - 组字过程中只更新本地草稿，不把拼音中间态写进工程模型；
 * - 组字结束（选词上屏）时一次性提交；
 * - 外部值变化（如撤销）时同步回显，但不会覆盖正在组字的输入。
 */
export function TextInput({ value, onCommit, ...rest }: TextInputProps) {
  const [draft, setDraft] = useState(value)
  const lastCommitted = useRef(value)
  const composing = useRef(false)

  useEffect(() => {
    if (value !== lastCommitted.current && !composing.current) {
      lastCommitted.current = value
      setDraft(value)
    }
  }, [value])

  const emit = (next: string) => {
    lastCommitted.current = next
    onCommit(next)
  }

  return (
    <input
      {...rest}
      value={draft}
      onCompositionStart={(event) => {
        composing.current = true
        rest.onCompositionStart?.(event)
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        const next = event.currentTarget.value
        setDraft(next)
        emit(next)
        rest.onCompositionEnd?.(event)
      }}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        if (!composing.current) emit(next)
      }}
      onBlur={(event) => {
        if (draft !== lastCommitted.current) emit(draft)
        rest.onBlur?.(event)
      }}
    />
  )
}
