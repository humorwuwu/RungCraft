import type { BaseDataType, DataTypeRef, MemoryArea, ParsedAddress } from './types'

const AREA_LETTER: Record<MemoryArea, string> = { I: 'I', Q: 'Q', M: 'M' }

export function isMemoryArea(value: string): value is MemoryArea {
  return value === 'I' || value === 'Q' || value === 'M'
}

/**
 * 解析西门子风格绝对地址：
 *   %I0.0 / I0.0 / %Q1.2 / %M10.3
 *   %IB0 / %IW64 / %ID100 / %MB0 / %QW0 ...
 *   %DB1.DBX0.0 / DB1.DBW2 / %DB1.DBD4
 * 返回 undefined 表示语法不合法。
 */
export function parseAddress(input: string): ParsedAddress | undefined {
  const text = input.trim().replace(/^%/, '').toUpperCase()
  if (!text) return undefined

  const dbMatch = text.match(/^DB(\d+)\.DB([XBWD])(\d+)(?:\.([0-7]))?$/)
  if (dbMatch) {
    const dbNumber = Number(dbMatch[1])
    const sizeLetter = dbMatch[2]
    const byte = Number(dbMatch[3])
    const bit = dbMatch[4] === undefined ? undefined : Number(dbMatch[4])
    const size = sizeFromLetter(sizeLetter)
    if (size === 'bit' && bit === undefined) return undefined
    return { area: 'M', byte, bit, size, dbNumber }
  }

  const match = text.match(/^([IQM])([XBWD])?(\d+)(?:\.([0-7]))?$/)
  if (!match) return undefined
  const area = match[1] as MemoryArea
  const sizeLetter = match[2]
  const byte = Number(match[3])
  const bit = match[4] === undefined ? undefined : Number(match[4])
  let size: ParsedAddress['size']
  if (sizeLetter) {
    size = sizeFromLetter(sizeLetter)
  } else {
    size = bit === undefined ? 'bit' : 'bit'
  }
  if (size === 'bit' && bit === undefined && sizeLetter !== 'X') {
    // 未写 .bit 且未写 X 的写法，如 I0，按字节处理更符合直觉。
    size = 'byte'
  }
  if (size === 'bit' && bit === undefined) return undefined
  return { area, byte, bit, size }
}

function sizeFromLetter(letter: string): ParsedAddress['size'] {
  switch (letter) {
    case 'X':
      return 'bit'
    case 'B':
      return 'byte'
    case 'W':
      return 'word'
    case 'D':
      return 'dword'
    default:
      return 'byte'
  }
}

export function formatAddress(address: ParsedAddress): string {
  const prefix = address.dbNumber !== undefined ? `%DB${address.dbNumber}.` : '%'
  const area = address.dbNumber !== undefined ? '' : AREA_LETTER[address.area]
  if (address.dbNumber !== undefined) {
    const letter = address.size === 'bit' ? 'X' : address.size === 'byte' ? 'B' : address.size === 'word' ? 'W' : 'D'
    const base = `${prefix}DB${letter}${address.byte}`
    return address.size === 'bit' ? `${base}.${address.bit ?? 0}` : base
  }
  switch (address.size) {
    case 'bit':
      return `${prefix}${area}${address.byte}.${address.bit ?? 0}`
    case 'byte':
      return `${prefix}${area}B${address.byte}`
    case 'word':
      return `${prefix}${area}W${address.byte}`
    case 'dword':
      return `${prefix}${area}D${address.byte}`
  }
}

/** 地址写法能表达的宽度；BOOLEAN 必须用位地址。 */
export function sizeForBaseType(type: BaseDataType): ParsedAddress['size'] {
  switch (type) {
    case 'BOOL':
      return 'bit'
    case 'BYTE':
      return 'byte'
    case 'WORD':
    case 'INT':
      return 'word'
    case 'DWORD':
    case 'DINT':
    case 'REAL':
    case 'TIME':
      return 'dword'
    default:
      return 'byte'
  }
}

/** 类型占用字节数；数组/结构体递归累加。 */
export function byteSizeOf(type: DataTypeRef): number {
  switch (type.kind) {
    case 'base':
      return baseByteSize(type.type)
    case 'array':
      return byteSizeOf(type.element) * Math.max(0, type.length)
    case 'struct':
      return type.fields.reduce((sum, field) => sum + byteSizeOf(field.dataType), 0)
    case 'udt':
      // UDT 展开需要工程上下文；这里只用于粗略估算，真实布局由编译器负责。
      return 4
    case 'instance':
      // 真实大小由编译器的实例布局解析器决定；这里只用于粗略估算。
      return 4
  }
}

export function baseByteSize(type: BaseDataType): number {
  switch (type) {
    case 'BOOL':
      // 打包存储时按 1 bit 计；这里返回 1 以便简化对齐，真正的位分配在内存分配器中处理。
      return 1
    case 'BYTE':
      return 1
    case 'WORD':
    case 'INT':
      return 2
    case 'DWORD':
    case 'DINT':
    case 'REAL':
    case 'TIME':
      return 4
    default:
      return 1
  }
}

/** 地址是否落在内存区大小内。 */
export function addressWithinBounds(address: ParsedAddress, memorySizes: { I: number; Q: number; M: number }): boolean {
  if (address.dbNumber !== undefined) return true
  const limit = memorySizes[address.area]
  const bytes = address.size === 'bit' ? 1 : address.size === 'byte' ? 1 : address.size === 'word' ? 2 : 4
  return address.byte >= 0 && address.byte + bytes <= limit
}
