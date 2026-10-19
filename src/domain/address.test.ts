import { describe, expect, it } from 'vitest'
import { formatAddress, parseAddress } from './address'

describe('地址解析', () => {
  it('解析位地址', () => {
    expect(parseAddress('%I0.0')).toEqual({ area: 'I', byte: 0, bit: 0, size: 'bit' })
    expect(parseAddress('Q1.7')).toEqual({ area: 'Q', byte: 1, bit: 7, size: 'bit' })
  })

  it('解析字节/字/双字地址', () => {
    expect(parseAddress('%IB2')).toMatchObject({ area: 'I', byte: 2, size: 'byte' })
    expect(parseAddress('%IW64')).toMatchObject({ area: 'I', byte: 64, size: 'word' })
    expect(parseAddress('%MD10')).toMatchObject({ area: 'M', byte: 10, size: 'dword' })
  })

  it('解析 DB 绝对地址', () => {
    expect(parseAddress('%DB1.DBX0.1')).toMatchObject({ dbNumber: 1, byte: 0, bit: 1, size: 'bit' })
    expect(parseAddress('DB3.DBW4')).toMatchObject({ dbNumber: 3, byte: 4, size: 'word' })
  })

  it('拒绝非法地址', () => {
    expect(parseAddress('hello')).toBeUndefined()
    expect(parseAddress('%I0.8')).toBeUndefined()
  })

  it('格式化与解析互逆', () => {
    for (const text of ['%I0.0', '%Q1.2', '%MB5', '%IW64', '%DD' as string].slice(0, 4)) {
      const parsed = parseAddress(text)
      expect(parsed).toBeDefined()
      expect(formatAddress(parsed!).toUpperCase()).toBe(text.replace('IW', 'IW').toUpperCase())
    }
  })
})
