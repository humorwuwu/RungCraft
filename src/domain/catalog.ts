import type { BaseDataType, CoilVariant, ContactVariant, DataTypeRef } from './types'

export type InstructionCategory =
  | 'bit'
  | 'timer'
  | 'counter'
  | 'compare'
  | 'math'
  | 'move'
  | 'convert'
  | 'shift'
  | 'word'
  | 'program'
  | 'call'

export type InstructionPlacement = 'contact' | 'coil' | 'box'

export interface ParamSpec {
  name: string
  label: string
  direction: 'input' | 'output' | 'inout'
  /** 接受的类型；空数组表示任意类型（如 MOVE）。 */
  dataTypes: BaseDataType[]
  optional?: boolean
  /** 未填写时使用的字面量（例如比较/数学的常量）。 */
  defaultLiteral?: boolean | number | string
  hint?: string
}

export interface InstructionDef {
  id: string
  category: InstructionCategory
  label: string
  description: string
  placement: InstructionPlacement
  contactVariant?: ContactVariant
  coilVariant?: CoilVariant
  params: ParamSpec[]
  enEno: 'none' | 'optional' | 'always'
  /** 运行时/编译器分派标识。 */
  handler: string
  /** 调色板与画布上的默认宽度（网格单位）。 */
  widthUnits: number
  /** 指令变体附加信息，如比较/数学/字逻辑的 operator。 */
  extra?: Record<string, string>
}

export const COMPARABLE_TYPES: BaseDataType[] = ['INT', 'DINT', 'REAL', 'TIME']
export const NUMERIC_PARAM_TYPES: BaseDataType[] = ['BYTE', 'WORD', 'DWORD', 'INT', 'DINT', 'REAL', 'TIME']

/* ------------------------------------------------------------------ */
/* 位逻辑                                                              */
/* ------------------------------------------------------------------ */

export const CONTACT_DEFS: InstructionDef[] = [
  contactDef('NO', '常开触点', '操作数为 1 时导通'),
  contactDef('NC', '常闭触点', '操作数为 0 时导通'),
  contactDef('P', '上升沿触点', '检测到上升沿时导通一个扫描周期'),
  contactDef('N', '下降沿触点', '检测到下降沿时导通一个扫描周期'),
]

export const COIL_DEFS: InstructionDef[] = [
  coilDef('COIL', '线圈', '把能流写入操作数'),
  coilDef('COIL_NEG', '取反线圈', '把能流的反写入操作数'),
  coilDef('SET', '置位线圈', '能流为 1 时置位，断电时保持'),
  coilDef('RESET', '复位线圈', '能流为 1 时复位，断电时保持'),
  coilDef('EDGE_P', '上升沿线圈', '仅在能流上升沿写入 1'),
  coilDef('EDGE_N', '下降沿线圈', '仅在能流下降沿写入 1'),
]

function contactDef(variant: ContactVariant, label: string, description: string): InstructionDef {
  return {
    id: `contact.${variant}`,
    category: 'bit',
    label,
    description,
    placement: 'contact',
    contactVariant: variant,
    params: [],
    enEno: 'none',
    handler: `contact.${variant}`,
    widthUnits: 2,
  }
}

function coilDef(variant: CoilVariant, label: string, description: string): InstructionDef {
  return {
    id: `coil.${variant}`,
    category: 'bit',
    label,
    description,
    placement: 'coil',
    coilVariant: variant,
    params: [],
    enEno: 'none',
    handler: `coil.${variant}`,
    widthUnits: 2,
  }
}

/* ------------------------------------------------------------------ */
/* 定时器 / 计数器                                                     */
/* ------------------------------------------------------------------ */

export const TIMER_DEFS: InstructionDef[] = [
  boxDef({
    id: 'box.TON',
    category: 'timer',
    label: 'TON 接通延时',
    description: 'IN 为 1 持续 PT 后 Q 置 1；IN 为 0 时复位。',
    handler: 'TON',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['BOOL'], optional: true, hint: '留空时使用 EN 能流' },
      { name: 'PT', label: 'PT', direction: 'input', dataTypes: ['TIME'], defaultLiteral: 'T#1s' },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'ET', label: 'ET', direction: 'output', dataTypes: ['TIME'], optional: true },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.TOF',
    category: 'timer',
    label: 'TOF 断开延时',
    description: 'IN 为 1 时 Q 立即为 1；IN 变 0 后保持 PT 再复位。',
    handler: 'TOF',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['BOOL'], optional: true, hint: '留空时使用 EN 能流' },
      { name: 'PT', label: 'PT', direction: 'input', dataTypes: ['TIME'], defaultLiteral: 'T#1s' },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'ET', label: 'ET', direction: 'output', dataTypes: ['TIME'], optional: true },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.TP',
    category: 'timer',
    label: 'TP 脉冲定时器',
    description: 'IN 上升沿产生宽度为 PT 的脉冲。',
    handler: 'TP',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['BOOL'], optional: true, hint: '留空时使用 EN 能流' },
      { name: 'PT', label: 'PT', direction: 'input', dataTypes: ['TIME'], defaultLiteral: 'T#1s' },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'ET', label: 'ET', direction: 'output', dataTypes: ['TIME'], optional: true },
    ],
    widthUnits: 4,
  }),
]

export const COUNTER_DEFS: InstructionDef[] = [
  boxDef({
    id: 'box.CTU',
    category: 'counter',
    label: 'CTU 加计数',
    description: 'CU 上升沿使 CV 加 1；CV ≥ PV 时 Q 为 1。',
    handler: 'CTU',
    params: [
      { name: 'CU', label: 'CU', direction: 'input', dataTypes: ['BOOL'], optional: true, hint: '留空时使用 EN 能流' },
      { name: 'PV', label: 'PV', direction: 'input', dataTypes: ['INT'], defaultLiteral: 10 },
      { name: 'R', label: 'R', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'CV', label: 'CV', direction: 'output', dataTypes: ['INT'], optional: true },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.CTD',
    category: 'counter',
    label: 'CTD 减计数',
    description: 'CD 上升沿使 CV 减 1；CV ≤ 0 时 Q 为 1。',
    handler: 'CTD',
    params: [
      { name: 'CD', label: 'CD', direction: 'input', dataTypes: ['BOOL'], optional: true, hint: '留空时使用 EN 能流' },
      { name: 'PV', label: 'PV', direction: 'input', dataTypes: ['INT'], defaultLiteral: 10 },
      { name: 'LD', label: 'LD', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'CV', label: 'CV', direction: 'output', dataTypes: ['INT'], optional: true },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.CTUD',
    category: 'counter',
    label: 'CTUD 加减计数',
    description: 'CU 上升沿加 1，CD 上升沿减 1。',
    handler: 'CTUD',
    params: [
      { name: 'CU', label: 'CU', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'CD', label: 'CD', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'PV', label: 'PV', direction: 'input', dataTypes: ['INT'], defaultLiteral: 10 },
      { name: 'R', label: 'R', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'LD', label: 'LD', direction: 'input', dataTypes: ['BOOL'], optional: true },
      { name: 'Q', label: 'Q', direction: 'output', dataTypes: ['BOOL'], optional: true },
      { name: 'CV', label: 'CV', direction: 'output', dataTypes: ['INT'], optional: true },
    ],
    widthUnits: 5,
  }),
]

/* ------------------------------------------------------------------ */
/* 比较 / 数学 / 移动 / 转换 / 移位 / 字逻辑                            */
/* ------------------------------------------------------------------ */

export const COMPARE_DEFS: InstructionDef[] = [
  compareDef('EQ', '== 等于'),
  compareDef('NE', '<> 不等于'),
  compareDef('GT', '> 大于'),
  compareDef('LT', '< 小于'),
  compareDef('GE', '>= 大于等于'),
  compareDef('LE', '<= 小于等于'),
]

function compareDef(op: string, label: string): InstructionDef {
  return boxDef({
    id: `box.CMP_${op}`,
    category: 'compare',
    label,
    description: '比较 IN1 与 IN2，结果为真时 ENO 导通。',
    handler: 'CMP',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: COMPARABLE_TYPES },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: COMPARABLE_TYPES },
    ],
    widthUnits: 4,
    extra: { operator: op },
  })
}

export const MATH_DEFS: InstructionDef[] = [
  mathDef('ADD', 'ADD 加', 'IN1 + IN2'),
  mathDef('SUB', 'SUB 减', 'IN1 - IN2'),
  mathDef('MUL', 'MUL 乘', 'IN1 * IN2'),
  mathDef('DIV', 'DIV 除', 'IN1 / IN2'),
  mathDef('MOD', 'MOD 取余', 'IN1 mod IN2'),
]

function mathDef(op: string, label: string, description: string): InstructionDef {
  return boxDef({
    id: `box.MATH_${op}`,
    category: 'math',
    label,
    description,
    handler: 'MATH',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: NUMERIC_PARAM_TYPES },
    ],
    widthUnits: 4,
    extra: { operator: op },
  })
}

export const OTHER_BOX_DEFS: InstructionDef[] = [
  boxDef({
    id: 'box.ABS',
    category: 'math',
    label: 'ABS 绝对值',
    description: '输出 IN 的绝对值。',
    handler: 'ABS',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: NUMERIC_PARAM_TYPES },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.MIN',
    category: 'math',
    label: 'MIN 最小值',
    description: '输出两个输入中的较小值。',
    handler: 'MINMAX',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: NUMERIC_PARAM_TYPES },
    ],
    widthUnits: 4,
    extra: { operator: 'MIN' },
  }),
  boxDef({
    id: 'box.MAX',
    category: 'math',
    label: 'MAX 最大值',
    description: '输出两个输入中的较大值。',
    handler: 'MINMAX',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: NUMERIC_PARAM_TYPES },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: NUMERIC_PARAM_TYPES },
    ],
    widthUnits: 4,
    extra: { operator: 'MAX' },
  }),
  boxDef({
    id: 'box.MOVE',
    category: 'move',
    label: 'MOVE 赋值',
    description: '把 IN 写入 OUT。',
    handler: 'MOVE',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: [] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: [] },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.CONVERT',
    category: 'convert',
    label: 'CONVERT 转换',
    description: '把 IN 转换为 OUT 的类型。',
    handler: 'CONVERT',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: [] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: [] },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.ROUND',
    category: 'convert',
    label: 'ROUND 四舍五入',
    description: 'REAL 四舍五入为整数。',
    handler: 'ROUND',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['REAL'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['INT', 'DINT'] },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.TRUNC',
    category: 'convert',
    label: 'TRUNC 取整',
    description: 'REAL 截断为整数。',
    handler: 'TRUNC',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['REAL'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['INT', 'DINT'] },
    ],
    widthUnits: 4,
  }),
  boxDef({
    id: 'box.SHL',
    category: 'shift',
    label: 'SHL 左移',
    description: '按位左移 N 位。',
    handler: 'SHIFT',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'N', label: 'N', direction: 'input', dataTypes: ['INT'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
    ],
    widthUnits: 4,
    extra: { operator: 'SHL' },
  }),
  boxDef({
    id: 'box.SHR',
    category: 'shift',
    label: 'SHR 右移',
    description: '按位右移 N 位。',
    handler: 'SHIFT',
    params: [
      { name: 'IN', label: 'IN', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'N', label: 'N', direction: 'input', dataTypes: ['INT'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
    ],
    widthUnits: 4,
    extra: { operator: 'SHR' },
  }),
  boxDef({
    id: 'box.WORD_AND',
    category: 'word',
    label: 'AND 字逻辑与',
    description: '按位与。',
    handler: 'WORD',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
    ],
    widthUnits: 4,
    extra: { operator: 'AND' },
  }),
  boxDef({
    id: 'box.WORD_OR',
    category: 'word',
    label: 'OR 字逻辑或',
    description: '按位或。',
    handler: 'WORD',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
    ],
    widthUnits: 4,
    extra: { operator: 'OR' },
  }),
  boxDef({
    id: 'box.WORD_XOR',
    category: 'word',
    label: 'XOR 字逻辑异或',
    description: '按位异或。',
    handler: 'WORD',
    params: [
      { name: 'IN1', label: 'IN1', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'IN2', label: 'IN2', direction: 'input', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
      { name: 'OUT', label: 'OUT', direction: 'output', dataTypes: ['BYTE', 'WORD', 'DWORD'] },
    ],
    widthUnits: 4,
    extra: { operator: 'XOR' },
  }),
]

interface BoxDefInput {
  id: string
  category: InstructionCategory
  label: string
  description: string
  handler: string
  params: ParamSpec[]
  widthUnits: number
  extra?: Record<string, string>
}

function boxDef(input: BoxDefInput): InstructionDef {
  return {
    id: input.id,
    category: input.category,
    label: input.label,
    description: input.description,
    placement: 'box',
    params: input.params,
    enEno: 'always',
    handler: input.handler,
    widthUnits: input.widthUnits,
    ...(input.extra ? { extra: input.extra } : {}),
  }
}

/* ------------------------------------------------------------------ */
/* 汇总与查询                                                          */
/* ------------------------------------------------------------------ */

export const PROGRAM_DEFS: InstructionDef[] = [
  boxDef({
    id: 'box.JMP',
    category: 'program',
    label: 'JMP 跳转',
    description: '能流为 1 时跳转到同一块内的 LABEL。',
    handler: 'JMP',
    params: [],
    widthUnits: 3,
  }),
  boxDef({
    id: 'box.LABEL',
    category: 'program',
    label: 'LABEL 标签',
    description: '跳转目标标签，无副作用。',
    handler: 'LABEL',
    params: [],
    widthUnits: 3,
  }),
]

export const BOX_DEFS: InstructionDef[] = [
  ...TIMER_DEFS,
  ...COUNTER_DEFS,
  ...COMPARE_DEFS,
  ...MATH_DEFS,
  ...OTHER_BOX_DEFS,
  ...PROGRAM_DEFS,
]

export const ALL_INSTRUCTIONS: InstructionDef[] = [...CONTACT_DEFS, ...COIL_DEFS, ...BOX_DEFS]

const INSTRUCTION_MAP = new Map(ALL_INSTRUCTIONS.map((def) => [def.id, def]))

export function getInstruction(id: string): InstructionDef | undefined {
  return INSTRUCTION_MAP.get(id)
}

export function instructionOperator(def: InstructionDef): string | undefined {
  return def.extra?.operator
}

export const CATEGORY_LABELS: Record<InstructionCategory, string> = {
  bit: '位逻辑',
  timer: '定时器',
  counter: '计数器',
  compare: '比较',
  math: '数学',
  move: '移动',
  convert: '转换',
  shift: '移位',
  word: '字逻辑',
  program: '程序控制',
  call: '调用',
}

export interface PaletteGroup {
  category: InstructionCategory
  label: string
  items: InstructionDef[]
}

export function paletteGroups(): PaletteGroup[] {
  const order: InstructionCategory[] = ['bit', 'timer', 'counter', 'compare', 'math', 'move', 'convert', 'shift', 'word', 'program', 'call']
  return order
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: ALL_INSTRUCTIONS.filter((def) => def.category === category),
    }))
    .filter((group) => group.items.length > 0)
}

/** 供属性面板显示参数类型的辅助。 */
export function paramAccepts(spec: ParamSpec, type: DataTypeRef): boolean {
  if (spec.dataTypes.length === 0) return true
  if (type.kind !== 'base') return false
  return spec.dataTypes.includes(type.type)
}
