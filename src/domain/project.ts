import { newId } from './ids'
import { createBox, createCall, createCoil, createContact, createParallel, createSeries } from './ladderOps'
import type {
  BlockInterface,
  DataBlock,
  LadderNetwork,
  Operand,
  ProgramBlock,
  Project,
  Tag,
  TagTable,
  UdtDef,
  VarDecl,
} from './types'
import { baseType } from './types'

export const SCHEMA_VERSION = 2

export function createEmptyInterface(): BlockInterface {
  return { inputs: [], outputs: [], inOuts: [], statics: [], temps: [] }
}

export function createNetwork(title = ''): LadderNetwork {
  return {
    id: newId('net'),
    title,
    comment: '',
    root: createSeries([]),
  }
}

export function createTag(name: string, address: string, dataType: Tag['dataType'], comment = ''): Tag {
  return { id: newId('tag'), name, address, dataType, comment }
}

export function createVarDecl(name: string, dataType: VarDecl['dataType'], comment = ''): VarDecl {
  return { id: newId('var'), name, dataType, comment }
}

export function createProgramBlock(kind: ProgramBlock['kind'], name: string, number: number): ProgramBlock {
  return {
    id: newId('blk'),
    name,
    kind,
    number,
    interface: createEmptyInterface(),
    networks: [createNetwork('网络 1')],
  }
}

export function createDataBlock(name: string, number: number, kind: DataBlock['kind'] = 'global'): DataBlock {
  return { id: newId('db'), number, name, kind, fields: [] }
}

/** 新建一个空的 PLC 数据类型（UDT）。 */
export function createUdt(name: string, comment = ''): UdtDef {
  return { id: newId('udt'), name, comment, fields: [] }
}

export function nextUdtName(project: Project): string {
  let index = project.userTypes.length + 1
  while (project.userTypes.some((udt) => udt.name === `Type_${index}`)) index += 1
  return `Type_${index}`
}

/**
 * 依据 FB 接口重建实例数据块字段。
 * 实例 DB 的字段是接口的投影：接口增删/改名/改类型后必须同步，否则在线监视与
 * 编译布局会不一致。字段 id 尽量沿用，避免在线订阅键抖动。
 */
export function syncInstanceDbFields(project: Project): void {
  for (const db of project.dataBlocks) {
    if (db.kind !== 'instance' || !db.instanceOf) continue
    const fb = project.blocks.find((block) => block.id === db.instanceOf)
    if (!fb) continue
    const decls = [...fb.interface.inputs, ...fb.interface.outputs, ...fb.interface.inOuts, ...fb.interface.statics]
    const previous = new Map(db.fields.map((field) => [field.name, field]))
    db.fields = decls.map((decl) => {
      const existing = previous.get(decl.name)
      return {
        ...decl,
        id: existing?.id ?? newId('var'),
        initialValue: existing?.initialValue,
      }
    })
  }
}

export function nextBlockNumber(project: Project): number {
  return project.blocks.reduce((max, block) => Math.max(max, block.number), 0) + 1
}

export function nextDbNumber(project: Project): number {
  return project.dataBlocks.reduce((max, db) => Math.max(max, db.number), 0) + 1
}

export function createProject(name = '新建工程'): Project {
  const now = new Date().toISOString()
  const tagTable: TagTable = {
    id: newId('tt'),
    name: 'PLC 变量表',
    tags: [],
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('prj'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    settings: {
      scanTimeMs: 20,
      memorySizes: { I: 128, Q: 128, M: 256 },
      locale: 'zh-CN',
    },
    tagTables: [tagTable],
    userTypes: [],
    dataBlocks: [],
    blocks: [createProgramBlock('OB', 'Main', 1)],
    watchTables: [],
    hmi: { screens: [], recipes: [] },
  }
}

/** 内置示例：电机启停自锁 + 运行指示灯。 */
export function createMotorSampleProject(): Project {
  const project = createProject('电机启停示例')
  const table = project.tagTables[0]
  const start = createTag('Start', '%I0.0', baseType('BOOL'), '启动按钮')
  const stop = createTag('Stop', '%I0.1', baseType('BOOL'), '停止按钮（常闭）')
  const motor = createTag('Motor', '%Q0.0', baseType('BOOL'), '电机接触器')
  const lamp = createTag('RunLamp', '%Q0.1', baseType('BOOL'), '运行指示灯')
  table.tags.push(start, stop, motor, lamp)

  const tagOperand = (tag: Tag): Operand => ({ kind: 'tag', tagId: tag.id })

  const block = project.blocks[0]
  const sealIn: LadderNetwork = {
    id: newId('net'),
    title: '电机启停',
    comment: '按 Start 启动，Motor 自锁；Stop 断开。',
    root: createSeries([
      createParallel([createContact('NO', tagOperand(start)), createContact('NO', tagOperand(motor))]),
      createContact('NC', tagOperand(stop)),
      createCoil('COIL', tagOperand(motor)),
    ]),
  }
  const lampNetwork: LadderNetwork = {
    id: newId('net'),
    title: '运行指示灯',
    comment: '',
    root: createSeries([createContact('NO', tagOperand(motor)), createCoil('COIL', tagOperand(lamp))]),
  }
  block.networks = [sealIn, lampNetwork]

  project.watchTables.push({
    id: newId('wt'),
    name: '监视表 1',
    entries: [
      { id: newId('we'), operand: tagOperand(motor), format: 'BOOL' },
      { id: newId('we'), operand: tagOperand(lamp), format: 'BOOL' },
    ],
  })
  return project
}

/** 内置示例：定时器 + 计数器 + 比较构成的循环交通灯。 */
export function createTrafficLightSampleProject(): Project {
  const project = createProject('交通灯示例')
  const table = project.tagTables[0]
  const run = createTag('Run', '%I0.0', baseType('BOOL'), '启动循环')
  const red = createTag('Red', '%Q0.0', baseType('BOOL'), '红灯')
  const yellow = createTag('Yellow', '%Q0.1', baseType('BOOL'), '黄灯')
  const green = createTag('Green', '%Q0.2', baseType('BOOL'), '绿灯')
  const pulse = createTag('Pulse', '%M0.0', baseType('BOOL'), '相位脉冲（2 秒）')
  const cycle = createTag('Cycle', '%M0.1', baseType('BOOL'), '一轮结束')
  table.tags.push(run, red, yellow, green, pulse, cycle)

  const tagOperand = (tag: Tag): Operand => ({ kind: 'tag', tagId: tag.id })
  const literal = (value: number): Operand => ({ kind: 'literal', dataType: 'INT', value })

  const db = createDataBlock('TrafficData', 1)
  db.fields.push(createVarDecl('Step', baseType('INT'), '当前相位 0=红 1=黄 2=绿'))
  project.dataBlocks.push(db)
  const step: Operand = { kind: 'dbField', dbId: db.id, path: ['Step'] }

  const ob = project.blocks[0]
  ob.networks = [
    {
      id: newId('net'),
      title: '相位脉冲',
      comment: 'Run 接通时，TON 每 2 秒产生一个脉冲：Q 接通后经 NC 触点把自己复位。',
      root: createSeries([
        createContact('NO', tagOperand(run)),
        createContact('NC', tagOperand(pulse)),
        createBox('box.TON', { PT: { kind: 'literal', dataType: 'TIME', value: 'T#2s' }, Q: tagOperand(pulse) }),
      ]),
    },
    {
      id: newId('net'),
      title: '相位计数 0-2 循环',
      comment: '每个脉冲加 1；到 3 时用自身 Q 复位，形成 0/1/2 循环。',
      root: createSeries([
        createContact('NO', tagOperand(run)),
        createBox('box.CTU', { CU: tagOperand(pulse), PV: literal(3), R: tagOperand(cycle), Q: tagOperand(cycle), CV: step }),
      ]),
    },
    {
      id: newId('net'),
      title: '红灯：相位 0',
      comment: '',
      root: createSeries([createBox('box.CMP_EQ', { IN1: step, IN2: literal(0) }), createCoil('COIL', tagOperand(red))]),
    },
    {
      id: newId('net'),
      title: '黄灯：相位 1',
      comment: '',
      root: createSeries([createBox('box.CMP_EQ', { IN1: step, IN2: literal(1) }), createCoil('COIL', tagOperand(yellow))]),
    },
    {
      id: newId('net'),
      title: '绿灯：相位 2',
      comment: '',
      root: createSeries([createBox('box.CMP_EQ', { IN1: step, IN2: literal(2) }), createCoil('COIL', tagOperand(green))]),
    },
  ]

  project.watchTables.push({
    id: newId('wt'),
    name: '监视表 1',
    entries: [
      { id: newId('we'), operand: step, format: 'DEC' },
      { id: newId('we'), operand: tagOperand(red), format: 'BOOL' },
      { id: newId('we'), operand: tagOperand(yellow), format: 'BOOL' },
      { id: newId('we'), operand: tagOperand(green), format: 'BOOL' },
    ],
  })
  return project
}

/** 内置示例：启停自锁 + 光电计数 + 满箱指示。 */
export function createConveyorSampleProject(): Project {
  const project = createProject('传送带计数示例')
  const table = project.tagTables[0]
  const start = createTag('Start', '%I0.0', baseType('BOOL'), '启动')
  const stop = createTag('Stop', '%I0.1', baseType('BOOL'), '停止')
  const sensor = createTag('Sensor', '%I0.2', baseType('BOOL'), '光电传感器')
  const reset = createTag('Reset', '%I0.3', baseType('BOOL'), '计数复位')
  const motor = createTag('Motor', '%Q0.0', baseType('BOOL'), '传送带电机')
  const full = createTag('Full', '%Q0.1', baseType('BOOL'), '满箱指示')
  table.tags.push(start, stop, sensor, reset, motor, full)

  const tagOperand = (tag: Tag): Operand => ({ kind: 'tag', tagId: tag.id })

  const db = createDataBlock('ConveyorData', 1)
  db.fields.push(createVarDecl('Count', baseType('INT'), '已计数工件'))
  project.dataBlocks.push(db)
  const count: Operand = { kind: 'dbField', dbId: db.id, path: ['Count'] }

  const ob = project.blocks[0]
  ob.networks = [
    {
      id: newId('net'),
      title: '传送带启停自锁',
      comment: '',
      root: createSeries([
        createParallel([createContact('NO', tagOperand(start)), createContact('NO', tagOperand(motor))]),
        createContact('NC', tagOperand(stop)),
        createCoil('COIL', tagOperand(motor)),
      ]),
    },
    {
      id: newId('net'),
      title: '光电计数（上升沿）',
      comment: '电机运行时，传感器每个上升沿计数一次；Reset 清零。',
      root: createSeries([
        createContact('NO', tagOperand(motor)),
        createContact('P', tagOperand(sensor)),
        createBox('box.CTU', { PV: { kind: 'literal', dataType: 'INT', value: 5 }, R: tagOperand(reset), CV: count }),
      ]),
    },
    {
      id: newId('net'),
      title: '满 5 件指示',
      comment: '',
      root: createSeries([
        createBox('box.CMP_GE', { IN1: count, IN2: { kind: 'literal', dataType: 'INT', value: 5 } }),
        createCoil('COIL', tagOperand(full)),
      ]),
    },
  ]

  project.watchTables.push({
    id: newId('wt'),
    name: '监视表 1',
    entries: [
      { id: newId('we'), operand: count, format: 'DEC' },
      { id: newId('we'), operand: tagOperand(motor), format: 'BOOL' },
      { id: newId('we'), operand: tagOperand(full), format: 'BOOL' },
    ],
  })
  return project
}

/** 内置示例：FB + DB + UDT + 模拟量比较的水箱控制。 */
export function createTankSampleProject(): Project {
  const project = createProject('水箱控制示例')
  const table = project.tagTables[0]
  const start = createTag('Enable', '%I0.0', baseType('BOOL'), '使能')
  const level = createTag('Level', '%IW64', baseType('INT'), '液位（0-100）')
  const pump = createTag('Pump', '%Q0.0', baseType('BOOL'), '进水泵')
  const valve = createTag('Valve', '%Q0.1', baseType('BOOL'), '排水阀')
  table.tags.push(start, level, pump, valve)

  const tagOperand = (tag: Tag): Operand => ({ kind: 'tag', tagId: tag.id })

  // PLC 数据类型（UDT）：被 FB 静态变量与数据块字段复用。
  const tankInfo = createUdt('TankInfo', '水箱状态快照')
  const infoLevel = createVarDecl('Level', baseType('INT'), '液位')
  const infoSetpoint = createVarDecl('Setpoint', baseType('INT'), '设定值')
  const infoPump = createVarDecl('Pump', baseType('BOOL'), '进水泵')
  tankInfo.fields.push(infoLevel, infoSetpoint, infoPump)
  project.userTypes.push(tankInfo)
  const udtRef = (): VarDecl['dataType'] => ({ kind: 'udt', udtId: tankInfo.id })

  // FB：根据液位与设定值控制泵/阀，并把状态存入 UDT 静态变量
  const fb = createProgramBlock('FB', 'TankCtrl', 2)
  const levelIn = createVarDecl('Level', baseType('INT'), '实际液位')
  const setpointIn = createVarDecl('Setpoint', baseType('INT'), '设定值')
  const pumpOut = createVarDecl('Pump', baseType('BOOL'), '进水泵')
  const valveOut = createVarDecl('Valve', baseType('BOOL'), '排水阀')
  const snapshot = createVarDecl('Snapshot', udtRef(), '状态快照（UDT）')
  fb.interface.inputs.push(levelIn, setpointIn)
  fb.interface.outputs.push(pumpOut, valveOut)
  fb.interface.statics.push(snapshot)
  const local = (variable: VarDecl): Operand => ({ kind: 'local', blockId: fb.id, varId: variable.id })
  const localField = (variable: VarDecl, path: string[]): Operand => ({ kind: 'local', blockId: fb.id, varId: variable.id, path })
  fb.networks = [
    {
      id: newId('net'),
      title: '液位低于设定值：开泵',
      comment: '',
      root: createSeries([
        createBox('box.CMP_LT', { IN1: local(levelIn), IN2: local(setpointIn) }),
        createCoil('COIL', local(pumpOut)),
      ]),
    },
    {
      id: newId('net'),
      title: '液位高于设定值：开阀',
      comment: '',
      root: createSeries([
        createBox('box.CMP_GE', { IN1: local(levelIn), IN2: local(setpointIn) }),
        createCoil('COIL', local(valveOut)),
      ]),
    },
    {
      id: newId('net'),
      title: '记录状态到 UDT 静态变量',
      comment: '通过 #Snapshot.字段 访问 UDT 静态变量，写入实例 DB。',
      root: createSeries([
        createBox('box.MOVE', { IN: local(levelIn), OUT: localField(snapshot, ['Level']) }),
        createBox('box.MOVE', { IN: local(setpointIn), OUT: localField(snapshot, ['Setpoint']) }),
        createCoil('COIL', localField(snapshot, ['Pump'])),
      ]),
    },
  ]
  project.blocks.push(fb)

  // 实例 DB（字段顺序与 FB 接口一致）与全局 DB
  const instance = createDataBlock('TankCtrl_DB', 1, 'instance')
  instance.instanceOf = fb.id
  instance.fields = [levelIn, setpointIn, pumpOut, valveOut, snapshot].map((variable) =>
    createVarDecl(variable.name, variable.dataType),
  )
  project.dataBlocks.push(instance)

  const dataDb = createDataBlock('TankData', 2)
  dataDb.fields.push(createVarDecl('Info', udtRef(), '水箱信息（UDT）'), {
    id: newId('var'),
    name: 'History',
    dataType: { kind: 'array', element: udtRef(), length: 4 },
    comment: '历史液位（UDT 数组）',
  })
  project.dataBlocks.push(dataDb)

  // OB1：使能时调用 FB，并把液位写入 DB 的 UDT 字段
  const ob = project.blocks[0]
  ob.networks = [
    {
      id: newId('net'),
      title: '调用水箱控制 FB',
      comment: 'Enable 接通时执行；Setpoint 为常量 50。',
      root: createSeries([
        createContact('NO', tagOperand(start)),
        createCall(fb.id, instance.id, {
          Level: tagOperand(level),
          Setpoint: { kind: 'literal', dataType: 'INT', value: 50 },
          Pump: tagOperand(pump),
          Valve: tagOperand(valve),
        }),
      ]),
    },
    {
      id: newId('net'),
      title: '记录液位到 DB',
      comment: '',
      root: createSeries([
        createBox('box.MOVE', {
          IN: tagOperand(level),
          OUT: { kind: 'dbField', dbId: dataDb.id, path: ['Info', 'Level'] },
        }),
      ]),
    },
  ]

  project.watchTables.push({
    id: newId('wt'),
    name: '监视表 1',
    entries: [
      { id: newId('we'), operand: tagOperand(level), format: 'DEC' },
      { id: newId('we'), operand: tagOperand(pump), format: 'BOOL' },
      { id: newId('we'), operand: tagOperand(valve), format: 'BOOL' },
      { id: newId('we'), operand: { kind: 'dbField', dbId: dataDb.id, path: ['Info', 'Level'] }, format: 'DEC' },
    ],
  })
  return project
}
