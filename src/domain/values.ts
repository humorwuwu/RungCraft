import type { BaseDataType, DataTypeRef, LiteralValue } from './types'

/** 把毫秒格式化为西门子 TIME 字面量，如 T#1s500ms。 */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return 'T#0ms'
  const sign = ms < 0 ? '-' : ''
  let rest = Math.abs(Math.round(ms))
  const days = Math.floor(rest / 86_400_000)
  rest -= days * 86_400_000
  const hours = Math.floor(rest / 3_600_000)
  rest -= hours * 3_600_000
  const minutes = Math.floor(rest / 60_000)
  rest -= minutes * 60_000
  const seconds = Math.floor(rest / 1000)
  const millis = rest - seconds * 1000
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds) parts.push(`${seconds}s`)
  if (millis || parts.length === 0) parts.push(`${millis}ms`)
  return `${sign}T#${parts.join('')}`
}

const TIME_UNITS: Array<[RegExp, number]> = [
  [/^(\d+(?:\.\d+)?)d/i, 86_400_000],
  [/^(\d+(?:\.\d+)?)h/i, 3_600_000],
  [/^(\d+(?:\.\d+)?)m(?!s)/i, 60_000],
  [/^(\d+(?:\.\d+)?)s/i, 1000],
  [/^(\d+(?:\.\d+)?)ms/i, 1],
]

/** 解析 T#1s500ms / TIME#500ms / 1500 形式的 TIME。返回毫秒，非法返回 undefined。 */
export function parseTime(text: string): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  const body = trimmed.replace(/^(T|TIME)#/i, '')
  const negative = body.startsWith('-')
  let rest = negative ? body.slice(1) : body
  let total = 0
  let matched = false
  while (rest.length > 0) {
    let found = false
    for (const [pattern, multiplier] of TIME_UNITS) {
      const match = rest.match(pattern)
      if (match) {
        total += Number(match[1]) * multiplier
        rest = rest.slice(match[0].length)
        found = true
        matched = true
        break
      }
    }
    if (!found) return undefined
  }
  if (!matched) return undefined
  return negative ? -total : total
}

export function formatLiteral(value: LiteralValue, dataType: BaseDataType): string {
  if (dataType === 'BOOL') return value ? 'TRUE' : 'FALSE'
  if (dataType === 'TIME') return formatTime(typeof value === 'number' ? value : 0)
  if (typeof value === 'number') {
    if (dataType === 'REAL') return Number.isInteger(value) ? `${value}.0` : String(value)
    return String(value)
  }
  return String(value)
}

export function parseLiteral(text: string, dataType: BaseDataType): LiteralValue | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  switch (dataType) {
    case 'BOOL': {
      const upper = trimmed.toUpperCase()
      if (upper === 'TRUE' || upper === '1') return true
      if (upper === 'FALSE' || upper === '0') return false
      return undefined
    }
    case 'TIME':
      return parseTime(trimmed)
    case 'REAL': {
      const value = Number(trimmed)
      return Number.isFinite(value) ? value : undefined
    }
    case 'BYTE':
    case 'WORD':
    case 'DWORD':
    case 'INT':
    case 'DINT': {
      const value = Number(trimmed)
      return Number.isFinite(value) ? Math.trunc(value) : undefined
    }
    default:
      return trimmed
  }
}

/** 类型默认值，用于 DB 初始化与字面量默认。 */
export function defaultValueForType(type: DataTypeRef): LiteralValue {
  switch (type.kind) {
    case 'base':
      switch (type.type) {
        case 'BOOL':
          return false
        case 'REAL':
          return 0
        case 'TIME':
          return 0
        default:
          return 0
      }
    case 'array':
      return 0
    case 'struct':
    case 'udt':
      return 0
    case 'instance':
      return 0
  }
}

export function baseTypeLabel(type: BaseDataType): string {
  switch (type) {
    case 'BOOL':
      return '布尔'
    case 'BYTE':
      return '字节'
    case 'WORD':
      return '字'
    case 'DWORD':
      return '双字'
    case 'INT':
      return '整数'
    case 'DINT':
      return '双整数'
    case 'REAL':
      return '浮点数'
    case 'TIME':
      return '时间'
    default:
      return type
  }
}
