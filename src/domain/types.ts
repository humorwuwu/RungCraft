/**
 * 工程领域模型：工程、标签、块、数据块与梯形图能流树。
 * 这里只放类型与常量，保持无 React / DOM 依赖。
 */

/* ------------------------------------------------------------------ */
/* 数据类型                                                            */
/* ------------------------------------------------------------------ */

export const BASE_DATA_TYPES = [
  'BOOL',
  'BYTE',
  'WORD',
  'DWORD',
  'INT',
  'DINT',
  'REAL',
  'TIME',
] as const

export type BaseDataType = (typeof BASE_DATA_TYPES)[number]

/** 递归类型描述：基础类型 / 一维数组 / 结构体 / 具名 UDT / FB 实例。 */
export type DataTypeRef =
  | { kind: 'base'; type: BaseDataType }
  | { kind: 'array'; element: DataTypeRef; length: number }
  | { kind: 'struct'; fields: VarDecl[] }
  /** 具名用户自定义类型（PLC 数据类型）引用，按 udtId 展开为结构体。 */
  | { kind: 'udt'; udtId: string }
  /** 多重实例：FB 内的静态变量可以是一个 FB 实例。 */
  | { kind: 'instance'; blockId: string }

export type LiteralValue = boolean | number | string

export interface VarDecl {
  id: string
  name: string
  dataType: DataTypeRef
  comment?: string
  initialValue?: LiteralValue
  retentive?: boolean
}

export function baseType(type: BaseDataType): DataTypeRef {
  return { kind: 'base', type }
}

export function arrayType(element: DataTypeRef, length: number): DataTypeRef {
  return { kind: 'array', element, length }
}

export function structType(fields: VarDecl[]): DataTypeRef {
  return { kind: 'struct', fields }
}

export function dataTypeEquals(a: DataTypeRef, b: DataTypeRef): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'base' && b.kind === 'base') return a.type === b.type
  if (a.kind === 'array' && b.kind === 'array') {
    return a.length === b.length && dataTypeEquals(a.element, b.element)
  }
  if (a.kind === 'struct' && b.kind === 'struct') {
    return a.fields.length === b.fields.length
  }
  if (a.kind === 'udt' && b.kind === 'udt') {
    return a.udtId === b.udtId
  }
  if (a.kind === 'instance' && b.kind === 'instance') {
    return a.blockId === b.blockId
  }
  return false
}

/** 数值型类型（可参与数学/比较/转换）。 */
export const NUMERIC_TYPES: readonly BaseDataType[] = ['BYTE', 'WORD', 'DWORD', 'INT', 'DINT', 'REAL', 'TIME']

export function isNumericType(type: DataTypeRef): boolean {
  return type.kind === 'base' && NUMERIC_TYPES.includes(type.type)
}

export function isBoolType(type: DataTypeRef): boolean {
  return type.kind === 'base' && type.type === 'BOOL'
}

/* ------------------------------------------------------------------ */
/* 地址与操作数                                                        */
/* ------------------------------------------------------------------ */

export type MemoryArea = 'I' | 'Q' | 'M'

export interface ParsedAddress {
  area: MemoryArea
  byte: number
  /** 仅位地址存在，0-7。 */
  bit?: number
  /** 访问宽度，由地址写法或标签类型决定。 */
  size: 'bit' | 'byte' | 'word' | 'dword'
  /** DB 绝对地址：DB 号；普通 I/Q/M 为空。 */
  dbNumber?: number
}

export type Operand =
  | { kind: 'literal'; dataType: BaseDataType; value: LiteralValue }
  | { kind: 'tag'; tagId: string }
  | { kind: 'dbField'; dbId: string; path: string[] }
  /** 块局部变量；path 用于访问结构体/UDT/数组字段（如 #MyType.Speed）。 */
  | { kind: 'local'; blockId: string; varId: string; path?: string[] }
  | { kind: 'instance'; instanceDbId: string; path: string[] }
  | { kind: 'address'; address: string }

/* ------------------------------------------------------------------ */
/* 标签表                                                              */
/* ------------------------------------------------------------------ */

export interface Tag {
  id: string
  name: string
  dataType: DataTypeRef
  /** 绝对地址，如 %I0.0 / %IW64 / %Q0.0 / %M10.0；可为空由编译器自动分配。 */
  address?: string
  comment?: string
  /** 是否在 HMI 变量选择中可见。 */
  hmiVisible?: boolean
}

export interface TagTable {
  id: string
  name: string
  tags: Tag[]
}

/* ------------------------------------------------------------------ */
/* 数据块                                                              */
/* ------------------------------------------------------------------ */

export type DataBlockKind = 'global' | 'instance'

/** 具名用户自定义类型（PLC 数据类型 / UDT），可在数据块与块接口中按名称复用。 */
export interface UdtDef {
  id: string
  name: string
  comment?: string
  fields: VarDecl[]
}

export interface DataBlock {
  id: string
  number: number
  name: string
  kind: DataBlockKind
  /** instance 类型时指向 FB 块。 */
  instanceOf?: string
  fields: VarDecl[]
  retentive?: boolean
}

/* ------------------------------------------------------------------ */
/* 程序块与梯形图                                                      */
/* ------------------------------------------------------------------ */

export type BlockKind = 'OB' | 'FC' | 'FB'

export interface BlockInterface {
  inputs: VarDecl[]
  outputs: VarDecl[]
  inOuts: VarDecl[]
  statics: VarDecl[]
  temps: VarDecl[]
  returnVar?: VarDecl
}

export type ContactVariant = 'NO' | 'NC' | 'P' | 'N'
export type CoilVariant = 'COIL' | 'COIL_NEG' | 'SET' | 'RESET' | 'EDGE_P' | 'EDGE_N'

export interface ContactNode {
  id: string
  kind: 'contact'
  variant: ContactVariant
  operand: Operand
}

export interface CoilNode {
  id: string
  kind: 'coil'
  variant: CoilVariant
  operand: Operand
}

export interface BoxNode {
  id: string
  kind: 'box'
  instructionId: string
  /** 参数名 -> 操作数；未填写的参数以 undefined 表示。 */
  params: Record<string, Operand | undefined>
  /** 是否显示/使用 EN/ENO。 */
  en: boolean
  eno: boolean
  /** 定时器/计数器等有状态指令的实例标识。 */
  instanceRef?: string
  /** JMP/LABEL 使用的标签名。 */
  label?: string
}

export interface CallNode {
  id: string
  kind: 'call'
  /** 被调用的 FC/FB 块。 */
  blockId: string
  /** FB 调用使用的实例数据块。 */
  instanceDbId?: string
  /** 多重实例：FB 调用使用当前 FB 中的静态实例变量。 */
  instanceRef?: Operand
  /** 参数名 -> 实参操作数。 */
  bindings: Record<string, Operand | undefined>
  en: boolean
  eno: boolean
}

export interface SeriesNode {
  id: string
  kind: 'series'
  children: LadderNode[]
}

export interface ParallelNode {
  id: string
  kind: 'parallel'
  children: LadderNode[]
}

export type LadderNode = SeriesNode | ParallelNode | ContactNode | CoilNode | BoxNode | CallNode

export type CombinatorNode = SeriesNode | ParallelNode

export function isCombinator(node: LadderNode): node is CombinatorNode {
  return node.kind === 'series' || node.kind === 'parallel'
}

export function isContact(node: LadderNode): node is ContactNode {
  return node.kind === 'contact'
}

export function isCoil(node: LadderNode): node is CoilNode {
  return node.kind === 'coil'
}

export function isBox(node: LadderNode): node is BoxNode {
  return node.kind === 'box'
}

export function isCall(node: LadderNode): node is CallNode {
  return node.kind === 'call'
}

export interface LadderNetwork {
  id: string
  title: string
  comment: string
  root: LadderNode
  layoutHints?: LayoutHints
}

export interface LayoutHints {
  /** 仅用于记录分支顺序等显示偏好，不保存绝对坐标。 */
  branchOrder?: Record<string, number[]>
  gaps?: Record<string, number>
}

export interface ProgramBlock {
  id: string
  name: string
  kind: BlockKind
  number: number
  comment?: string
  interface: BlockInterface
  networks: LadderNetwork[]
}

/* ------------------------------------------------------------------ */
/* 监视表 / HMI / 配方                                                  */
/* ------------------------------------------------------------------ */

export interface WatchTable {
  id: string
  name: string
  entries: WatchEntry[]
}

export interface WatchEntry {
  id: string
  operand: Operand
  /** 显示格式，如 'BOOL' | 'DEC' | 'HEX' | 'FLOAT'。 */
  format?: string
}

export type HmiWidgetKind = 'button' | 'lamp' | 'number' | 'text' | 'bar'

export interface HmiWidget {
  id: string
  kind: HmiWidgetKind
  x: number
  y: number
  w: number
  h: number
  label?: string
  /** 绑定的操作数。 */
  binding?: Operand
  /** 按钮行为：点动 / 切换 / 置位 / 复位。 */
  buttonMode?: 'momentary' | 'toggle' | 'set' | 'reset'
}

export interface HmiScreen {
  id: string
  name: string
  widgets: HmiWidget[]
}

export interface RecipeField {
  id: string
  name: string
  binding: Operand
  dataType: DataTypeRef
}

export interface RecipeRecord {
  id: string
  name: string
  values: Record<string, LiteralValue>
}

export interface Recipe {
  id: string
  name: string
  fields: RecipeField[]
  records: RecipeRecord[]
}

export interface HmiDocument {
  screens: HmiScreen[]
  recipes: Recipe[]
}

/* ------------------------------------------------------------------ */
/* 工程                                                                */
/* ------------------------------------------------------------------ */

export interface ProjectSettings {
  scanTimeMs: number
  memorySizes: { I: number; Q: number; M: number }
  locale: 'zh-CN'
}

export interface Project {
  schemaVersion: number
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  tagTables: TagTable[]
  /** PLC 数据类型（UDT）定义，可被数据块字段与块接口变量按名称引用。 */
  userTypes: UdtDef[]
  dataBlocks: DataBlock[]
  blocks: ProgramBlock[]
  watchTables: WatchTable[]
  hmi: HmiDocument
}
