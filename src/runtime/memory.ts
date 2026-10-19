import type { CompiledOperand, MemoryRef } from '@/compiler/ir'
import type { BaseDataType, MemoryArea } from '@/domain/types'

export type RuntimeArea = MemoryArea | 'DB' | 'L' | 'INST'

const LOCALS_SIZE = 64 * 1024

function clampInt(value: number, bits: number, signed: boolean): number {
  if (!Number.isFinite(value)) return 0
  const truncated = Math.trunc(value)
  if (signed) {
    const min = -(2 ** (bits - 1))
    const max = 2 ** (bits - 1) - 1
    if (truncated < min) return min
    if (truncated > max) return max
    return truncated
  }
  const max = 2 ** bits - 1
  if (truncated < 0) return 0
  if (truncated > max) return max
  return truncated
}

/**
 * 西门子风格大端内存：
 *  - I/Q/M 各一块字节区；
 *  - 全局/实例 DB 各自一块字节区；
 *  - L 为调用帧局部区（offset 相对 frameBase）；
 *  - INST 指向当前 FB 调用使用的实例 DB。
 */
export class ProcessMemory {
  readonly i: ArrayBuffer
  readonly q: ArrayBuffer
  readonly m: ArrayBuffer
  readonly locals: ArrayBuffer
  frameBase = 0
  private readonly dbs: Map<string, ArrayBuffer>
  private instanceBuffer?: ArrayBuffer
  private instanceDbId?: string
  /** 多重实例的起始偏移（相对实例 DB 起点）。 */
  instanceBase = 0

  constructor(sizes: { I: number; Q: number; M: number }, dbSizes: Array<{ dbId: string; sizeBytes: number }>) {
    this.i = new ArrayBuffer(sizes.I)
    this.q = new ArrayBuffer(sizes.Q)
    this.m = new ArrayBuffer(sizes.M)
    this.locals = new ArrayBuffer(LOCALS_SIZE)
    this.dbs = new Map(dbSizes.map((db) => [db.dbId, new ArrayBuffer(db.sizeBytes)]))
  }

  setInstanceDb(dbId: string | undefined): void {
    this.setInstance(dbId, 0)
  }

  setInstance(dbId: string | undefined, base: number): void {
    this.instanceDbId = dbId
    this.instanceBuffer = dbId ? this.dbs.get(dbId) : undefined
    this.instanceBase = base
  }

  getInstance(): { dbId?: string; base: number } {
    return { dbId: this.instanceDbId, base: this.instanceBase }
  }

  /** 用 0 清空一段局部帧，模拟 PLC 临时变量未定义即清零的行为。 */
  clearFrame(offset: number, size: number): void {
    if (size <= 0) return
    const view = new Uint8Array(this.locals, Math.min(offset, this.locals.byteLength), Math.min(size, this.locals.byteLength - offset))
    view.fill(0)
  }

  private buffer(area: RuntimeArea, dbId?: string): ArrayBuffer | undefined {
    switch (area) {
      case 'I':
        return this.i
      case 'Q':
        return this.q
      case 'M':
        return this.m
      case 'L':
        return this.locals
      case 'INST':
        return this.instanceBuffer
      case 'DB':
        return dbId ? this.dbs.get(dbId) : undefined
      default:
        return undefined
    }
  }

  private view(area: RuntimeArea, dbId?: string): DataView | undefined {
    const buffer = this.buffer(area, dbId)
    return buffer ? new DataView(buffer) : undefined
  }

  private effectiveOffset(area: RuntimeArea, offset: number): number {
    if (area === 'L') return offset + this.frameBase
    if (area === 'INST') return offset + this.instanceBase
    return offset
  }

  readBool(area: RuntimeArea, offset: number, bit: number, dbId?: string): boolean {
    const view = this.view(area, dbId)
    const effective = this.effectiveOffset(area, offset)
    if (!view || effective < 0 || effective >= view.byteLength) return false
    const byte = view.getUint8(effective)
    return (byte & (1 << (bit & 7))) !== 0
  }

  writeBool(area: RuntimeArea, offset: number, bit: number, value: boolean, dbId?: string): void {
    const view = this.view(area, dbId)
    const effective = this.effectiveOffset(area, offset)
    if (!view || effective < 0 || effective >= view.byteLength) return
    const current = view.getUint8(effective)
    const mask = 1 << (bit & 7)
    view.setUint8(effective, value ? current | mask : current & ~mask)
  }

  readNumber(ref: MemoryRef): number {
    const area = ref.area as RuntimeArea
    const view = this.view(area, ref.dbId)
    if (!view) return 0
    if (ref.width === 'bit') return this.readBool(area, ref.offset, ref.bit ?? 0, ref.dbId) ? 1 : 0
    const offset = this.effectiveOffset(area, ref.offset)
    if (offset < 0 || offset + this.widthBytes(ref) > view.byteLength) return 0
    switch (ref.type) {
      case 'REAL':
        return view.getFloat32(offset)
      case 'INT':
        return view.getInt16(offset)
      case 'DINT':
      case 'TIME':
        return view.getInt32(offset)
      case 'WORD':
        return view.getUint16(offset)
      case 'DWORD':
        return view.getUint32(offset)
      case 'BYTE':
      case 'BOOL':
      default:
        return view.getUint8(offset)
    }
  }

  writeNumber(ref: MemoryRef, value: number): void {
    const area = ref.area as RuntimeArea
    const view = this.view(area, ref.dbId)
    if (!view) return
    if (ref.width === 'bit') {
      this.writeBool(area, ref.offset, ref.bit ?? 0, value !== 0, ref.dbId)
      return
    }
    const offset = this.effectiveOffset(area, ref.offset)
    if (offset < 0 || offset + this.widthBytes(ref) > view.byteLength) return
    switch (ref.type) {
      case 'REAL':
        view.setFloat32(offset, Math.fround(Number.isFinite(value) ? value : 0))
        return
      case 'INT':
        view.setInt16(offset, clampInt(value, 16, true))
        return
      case 'DINT':
      case 'TIME':
        view.setInt32(offset, clampInt(value, 32, true))
        return
      case 'WORD':
        view.setUint16(offset, clampInt(value, 16, false))
        return
      case 'DWORD':
        view.setUint32(offset, clampInt(value, 32, false))
        return
      case 'BYTE':
      case 'BOOL':
      default:
        view.setUint8(offset, clampInt(value, 8, false))
    }
  }

  read(ref: CompiledOperand): boolean | number {
    if (ref.kind === 'const') return ref.value
    if (ref.width === 'bit') return this.readBool(ref.area as RuntimeArea, ref.offset, ref.bit ?? 0, ref.dbId)
    return this.readNumber(ref)
  }

  readBoolRef(ref: CompiledOperand): boolean {
    const value = this.read(ref)
    return typeof value === 'boolean' ? value : value !== 0
  }

  write(ref: CompiledOperand, value: boolean | number): void {
    if (ref.kind === 'const' || !ref.writable) return
    const area = ref.area as RuntimeArea
    if (ref.width === 'bit') {
      this.writeBool(area, ref.offset, ref.bit ?? 0, Boolean(value), ref.dbId)
      return
    }
    this.writeNumber(ref, typeof value === 'boolean' ? (value ? 1 : 0) : value)
  }

  private widthBytes(ref: MemoryRef): number {
    switch (ref.width) {
      case 'byte':
        return 1
      case 'word':
        return 2
      case 'dword':
        return 4
      default:
        return 1
    }
  }

  /** 读取指定区域的原始字节，用于快照/导出。 */
  bytes(area: RuntimeArea, dbId?: string): Uint8Array {
    const buffer = this.buffer(area, dbId)
    return buffer ? new Uint8Array(buffer) : new Uint8Array(0)
  }
}

export function isBoolType(type: BaseDataType): boolean {
  return type === 'BOOL'
}
