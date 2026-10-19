import { parseAddress, formatAddress } from './address'
import type { BaseDataType, MemoryArea, Project } from './types'

/** 收集工程中已使用的绝对地址（转成可比较的字符串）。 */
function usedAddresses(project: Project): Set<string> {
  const used = new Set<string>()
  for (const table of project.tagTables) {
    for (const tag of table.tags) {
      if (!tag.address) continue
      const parsed = parseAddress(tag.address)
      if (parsed) used.add(formatAddress(parsed).toUpperCase())
    }
  }
  return used
}

/** 为新标签分配下一个空闲地址：位地址从 0.0 开始，字地址按类型宽度递增。 */
export function nextFreeAddress(project: Project, area: MemoryArea, type: BaseDataType): string {
  const used = usedAddresses(project)
  const limit = project.settings.memorySizes[area]
  if (type === 'BOOL') {
    for (let byte = 0; byte < limit; byte += 1) {
      for (let bit = 0; bit < 8; bit += 1) {
        const candidate = formatAddress({ area, byte, bit, size: 'bit' })
        if (!used.has(candidate.toUpperCase())) return candidate
      }
    }
    return formatAddress({ area, byte: 0, bit: 0, size: 'bit' })
  }
  const step = type === 'BYTE' ? 1 : type === 'WORD' || type === 'INT' ? 2 : 4
  for (let byte = 0; byte + step <= limit; byte += step) {
    const candidate = formatAddress({ area, byte, size: step === 1 ? 'byte' : step === 2 ? 'word' : 'dword' })
    if (!used.has(candidate.toUpperCase())) return candidate
  }
  return formatAddress({ area, byte: 0, size: 'byte' })
}
