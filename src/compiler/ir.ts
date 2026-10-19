import type { BaseDataType, CoilVariant, ContactVariant, DataTypeRef, MemoryArea, Operand } from '@/domain/types'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  id: string
  severity: DiagnosticSeverity
  message: string
  blockId?: string
  networkId?: string
  nodeId?: string
}

/* ------------------------------------------------------------------ */
/* 已解析的操作数                                                      */
/* ------------------------------------------------------------------ */

export interface MemoryRef {
  kind: 'mem'
  area: MemoryArea | 'DB' | 'L' | 'INST'
  dbId?: string
  /** 字节偏移。 */
  offset: number
  /** 位地址 0-7，仅 BOOL 使用。 */
  bit?: number
  /** 读取/写入使用的宽度。 */
  width: 'bit' | 'byte' | 'word' | 'dword'
  /** 数据类型，用于有符号/浮点解释。 */
  type: BaseDataType
  writable: boolean
  /** 显示用文本，便于诊断。 */
  display: string
}

export interface ConstRef {
  kind: 'const'
  value: boolean | number
  type: BaseDataType
  display: string
}

export type CompiledOperand = MemoryRef | ConstRef

/* ------------------------------------------------------------------ */
/* 已编译的能流树                                                      */
/* ------------------------------------------------------------------ */

export interface CompiledTrace {
  inSlot: number
  outSlot: number
}

export interface CompiledContact {
  kind: 'contact'
  id: string
  variant: ContactVariant
  operand: CompiledOperand
  trace: CompiledTrace
}

export interface CompiledCoil {
  kind: 'coil'
  id: string
  variant: CoilVariant
  operand: CompiledOperand
  trace: CompiledTrace
}

export interface CompiledBox {
  kind: 'box'
  id: string
  instructionId: string
  handler: string
  operator?: string
  params: Record<string, CompiledOperand | undefined>
  en: boolean
  eno: boolean
  label?: string
  trace: CompiledTrace
}

export interface CompiledCallBinding {
  name: string
  direction: 'input' | 'output' | 'inout'
  actual?: CompiledOperand
}

export interface CallParamSlot {
  name: string
  offset: number
  bit?: number
  width: 'bit' | 'byte' | 'word' | 'dword'
  type: BaseDataType
  direction: 'input' | 'output' | 'inout' | 'static'
}

export interface CompiledCall {
  kind: 'call'
  id: string
  targetBlockId: string
  targetKind: 'FC' | 'FB'
  instanceDbId?: string
  /** 多重实例：指向当前 FB 静态实例变量的内存引用。 */
  instanceRef?: CompiledOperand
  bindings: CompiledCallBinding[]
  en: boolean
  eno: boolean
  trace: CompiledTrace
}

export interface CompiledCombinator {
  kind: 'series' | 'parallel'
  id: string
  children: CompiledNode[]
  trace: CompiledTrace
}

export type CompiledNode = CompiledCombinator | CompiledContact | CompiledCoil | CompiledBox | CompiledCall

export interface CompiledNetwork {
  id: string
  title: string
  root: CompiledNode
}

export interface CompiledBlock {
  id: string
  name: string
  kind: 'OB' | 'FC' | 'FB'
  networks: CompiledNetwork[]
  /** 调用帧大小（OB/FC 的参数与临时变量，FB 的临时变量）。 */
  frameSize: number
  /** 参数槽：FC/OB 用于调用时拷贝实参；FB 指向实例 DB 字段。 */
  params: CallParamSlot[]
  /** LABEL 名称 -> 网络索引，供 JMP 跳转。 */
  labels: Record<string, number>
}

export interface DbFieldLayout {
  path: string[]
  offset: number
  bit?: number
  type: DataTypeRef
  width: 'bit' | 'byte' | 'word' | 'dword'
}

export interface DbLayout {
  dbId: string
  number: number
  name: string
  kind: 'global' | 'instance'
  sizeBytes: number
  fields: DbFieldLayout[]
}

export interface CompiledProgram {
  buildId: string
  blocks: CompiledBlock[]
  dbs: DbLayout[]
  memorySizes: { I: number; Q: number; M: number }
  traceSlotCount: number
  diagnostics: Diagnostic[]
}

/* ------------------------------------------------------------------ */
/* 辅助                                                                */
/* ------------------------------------------------------------------ */

export function widthForBaseType(type: BaseDataType): 'bit' | 'byte' | 'word' | 'dword' {
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

export function isCompiledMemory(operand: CompiledOperand): operand is MemoryRef {
  return operand.kind === 'mem'
}

/** 供 UI/调试：把已编译操作数转回显示文本。 */
export function operandDisplay(operand: Operand | CompiledOperand | undefined): string {
  if (!operand) return ''
  if ('display' in operand) return operand.display
  return ''
}
