import { describe, expect, it } from 'vitest'
import { compileProject, createOperandResolver } from '@/compiler/compile'
import type { CompiledOperand } from '@/compiler/ir'
import { createBox, createCoil, createContact, createSeries } from '@/domain/ladderOps'
import {
  createConveyorSampleProject,
  createMotorSampleProject,
  createProject,
  createTag,
  createTankSampleProject,
  createTrafficLightSampleProject,
} from '@/domain/project'
import { findTagByName } from '@/domain/projectIndex'
import { baseType, type Operand, type Project } from '@/domain/types'
import { SimulationEngine } from './engine'

function prepare(project: Project) {
  const program = compileProject(project, 'test')
  const engine = new SimulationEngine(program)
  const resolve = createOperandResolver(project)
  return { program, engine, resolve }
}

function writeTag(project: Project, engine: SimulationEngine, resolve: (operand: Operand) => CompiledOperand | undefined, name: string, value: boolean | number) {
  const tag = findTagByName(project, name)
  if (!tag) throw new Error(`标签不存在: ${name}`)
  const ref = resolve({ kind: 'tag', tagId: tag.id })
  if (!ref) throw new Error(`无法解析标签: ${name}`)
  engine.memory.write(ref, value)
}

function readTag(project: Project, engine: SimulationEngine, resolve: (operand: Operand) => CompiledOperand | undefined, name: string): boolean | number {
  const tag = findTagByName(project, name)
  if (!tag) throw new Error(`标签不存在: ${name}`)
  const ref = resolve({ kind: 'tag', tagId: tag.id })
  if (!ref) throw new Error(`无法解析标签: ${name}`)
  return engine.memory.read(ref)
}

describe('扫描引擎：电机启停自锁', () => {
  it('启动、自锁、停止', () => {
    const project = createMotorSampleProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(false)

    writeTag(project, engine, resolve, 'Start', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(true)
    expect(readTag(project, engine, resolve, 'RunLamp')).toBe(true)

    writeTag(project, engine, resolve, 'Start', false)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(true)

    writeTag(project, engine, resolve, 'Stop', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(false)
    expect(readTag(project, engine, resolve, 'RunLamp')).toBe(false)
  })

  it('复位清空内存与扫描计数', () => {
    const project = createMotorSampleProject()
    const { engine, resolve } = prepare(project)
    writeTag(project, engine, resolve, 'Start', true)
    engine.scan(20)
    engine.reset()
    expect(engine.scanCount).toBe(0)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(false)
  })
})

describe('扫描引擎：JMP/LABEL', () => {
  function buildProject() {
    const project = createProject('跳转测试')
    const table = project.tagTables[0]
    const skip = createTag('Skip', '%I0.0', baseType('BOOL'))
    const mid = createTag('Mid', '%Q0.0', baseType('BOOL'))
    const end = createTag('End', '%Q0.1', baseType('BOOL'))
    table.tags.push(skip, mid, end)
    const skipOperand: Operand = { kind: 'tag', tagId: skip.id }
    const midOperand: Operand = { kind: 'tag', tagId: mid.id }
    const endOperand: Operand = { kind: 'tag', tagId: end.id }

    const jump = createBox('box.JMP')
    jump.label = 'END'
    const label = createBox('box.LABEL')
    label.label = 'END'

    project.blocks[0].networks = [
      { id: 'net1', title: '跳转', comment: '', root: createSeries([createContact('NO', skipOperand), jump]) },
      { id: 'net2', title: '被跳过', comment: '', root: createSeries([createCoil('COIL', midOperand)]) },
      { id: 'net3', title: '标签', comment: '', root: createSeries([label, createCoil('COIL', endOperand)]) },
    ]
    return project
  }

  it('条件成立时跳过后面的网络', () => {
    const project = buildProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    writeTag(project, engine, resolve, 'Skip', false)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Mid')).toBe(true)
    expect(readTag(project, engine, resolve, 'End')).toBe(true)

    engine.reset()
    writeTag(project, engine, resolve, 'Skip', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Mid')).toBe(false)
    expect(readTag(project, engine, resolve, 'End')).toBe(true)
  })

  it('未知标签产生编译错误', () => {
    const project = buildProject()
    const jump = project.blocks[0].networks[0].root
    if (jump.kind === 'series') {
      const box = jump.children[1]
      if (box.kind === 'box') box.label = 'MISSING'
    }
    const program = compileProject(project, 'test')
    expect(program.diagnostics.some((item) => item.severity === 'error' && item.message.includes('不存在'))).toBe(true)
  })
})

describe('扫描引擎：水箱 FB 示例', () => {
  it('根据液位与设定值控制泵和阀', () => {
    const project = createTankSampleProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    writeTag(project, engine, resolve, 'Enable', true)
    writeTag(project, engine, resolve, 'Level', 30)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Pump')).toBe(true)
    expect(readTag(project, engine, resolve, 'Valve')).toBe(false)

    writeTag(project, engine, resolve, 'Level', 70)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Pump')).toBe(false)
    expect(readTag(project, engine, resolve, 'Valve')).toBe(true)
  })

  it('UDT 静态变量与 UDT 数据块字段在线可读', () => {
    const project = createTankSampleProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    const instanceDb = project.dataBlocks.find((db) => db.kind === 'instance')
    const dataDb = project.dataBlocks.find((db) => db.name === 'TankData')
    if (!instanceDb || !dataDb) throw new Error('示例工程缺少数据块')

    const read = (operand: Operand): boolean | number => {
      const ref = resolve(operand)
      if (!ref) throw new Error('无法解析操作数')
      return engine.memory.read(ref)
    }

    writeTag(project, engine, resolve, 'Enable', true)
    writeTag(project, engine, resolve, 'Level', 30)
    engine.scan(20)

    // FB 内的 #Snapshot.Level / #Snapshot.Pump 落到实例 DB 的 UDT 字段上。
    expect(read({ kind: 'dbField', dbId: instanceDb.id, path: ['Snapshot', 'Level'] })).toBe(30)
    expect(read({ kind: 'dbField', dbId: instanceDb.id, path: ['Snapshot', 'Pump'] })).toBe(true)
    // OB1 把液位写入全局 DB 的 UDT 字段。
    expect(read({ kind: 'dbField', dbId: dataDb.id, path: ['Info', 'Level'] })).toBe(30)
  })
})

describe('扫描引擎：定时器与计数器', () => {
  function timerProject(handler: string) {
    const project = createProject('定时器测试')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const done = createTag('Done', '%Q0.0', baseType('BOOL'))
    table.tags.push(start, done)
    const startOperand: Operand = { kind: 'tag', tagId: start.id }
    const doneOperand: Operand = { kind: 'tag', tagId: done.id }
    const box = createBox(`box.${handler}`, {
      IN: startOperand,
      PT: { kind: 'literal', dataType: 'TIME', value: 100 },
    })
    project.blocks[0].networks[0].root = createSeries([createContact('NO', startOperand), box, createCoil('COIL', doneOperand)])
    return project
  }

  it('TON 在累计到 PT 后置位', () => {
    const project = timerProject('TON')
    const { engine, resolve } = prepare(project)
    writeTag(project, engine, resolve, 'Start', true)
    for (let index = 0; index < 4; index += 1) engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(false)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(true)
    writeTag(project, engine, resolve, 'Start', false)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(false)
  })

  it('TOF 在输入断开后延时复位', () => {
    const project = timerProject('TOF')
    const { engine, resolve } = prepare(project)
    writeTag(project, engine, resolve, 'Start', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(true)
    writeTag(project, engine, resolve, 'Start', false)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(true)
    for (let index = 0; index < 4; index += 1) engine.scan(20)
    expect(readTag(project, engine, resolve, 'Done')).toBe(false)
  })

  it('CTU 只在上升沿计数', () => {
    const project = createProject('计数测试')
    const table = project.tagTables[0]
    const pulse = createTag('Pulse', '%I0.0', baseType('BOOL'))
    const done = createTag('Done', '%Q0.0', baseType('BOOL'))
    table.tags.push(pulse, done)
    const pulseOperand: Operand = { kind: 'tag', tagId: pulse.id }
    const doneOperand: Operand = { kind: 'tag', tagId: done.id }
    const box = createBox('box.CTU', {
      CU: pulseOperand,
      PV: { kind: 'literal', dataType: 'INT', value: 2 },
    })
    project.blocks[0].networks[0].root = createSeries([createContact('NO', pulseOperand), box, createCoil('COIL', doneOperand)])
    const { engine, resolve } = prepare(project)

    const sendPulse = () => {
      writeTag(project, engine, resolve, 'Pulse', true)
      engine.scan(20)
      writeTag(project, engine, resolve, 'Pulse', false)
      engine.scan(20)
    }
    sendPulse()
    expect(readTag(project, engine, resolve, 'Done')).toBe(false)
    sendPulse()
    expect(readTag(project, engine, resolve, 'Done')).toBe(true)
  })

  it('上升沿触点只导通一个扫描', () => {
    const project = createProject('边沿测试')
    const table = project.tagTables[0]
    const input = createTag('In', '%I0.0', baseType('BOOL'))
    const output = createTag('Out', '%Q0.0', baseType('BOOL'))
    table.tags.push(input, output)
    const inOperand: Operand = { kind: 'tag', tagId: input.id }
    const outOperand: Operand = { kind: 'tag', tagId: output.id }
    project.blocks[0].networks[0].root = createSeries([createContact('P', inOperand), createCoil('COIL', outOperand)])
    const { engine, resolve } = prepare(project)

    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Out')).toBe(false)
    writeTag(project, engine, resolve, 'In', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Out')).toBe(true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Out')).toBe(false)
  })
})

/** 反复扫描直到条件满足（带扫描次数上限，避免死循环）。 */
function scanUntil(engine: SimulationEngine, predicate: () => boolean, maxScans = 400, scanTimeMs = 20): boolean {
  for (let index = 0; index < maxScans; index += 1) {
    engine.scan(scanTimeMs)
    if (predicate()) return true
  }
  return predicate()
}

describe('扫描引擎：交通灯示例', () => {
  it('定时器脉冲推动相位 红→黄→绿→红 循环', () => {
    const project = createTrafficLightSampleProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    writeTag(project, engine, resolve, 'Run', true)
    const isOn = (name: string) => () => readTag(project, engine, resolve, name) === true

    // 相位 0：红灯
    expect(scanUntil(engine, isOn('Red'))).toBe(true)
    // 2 秒后相位推进到黄灯
    expect(scanUntil(engine, isOn('Yellow'))).toBe(true)
    expect(scanUntil(engine, isOn('Green'))).toBe(true)
    // 一轮结束回到红灯
    expect(scanUntil(engine, isOn('Red'))).toBe(true)
  })
})

describe('扫描引擎：传送带计数示例', () => {
  it('上升沿计数到 5 触发满箱指示', () => {
    const project = createConveyorSampleProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    writeTag(project, engine, resolve, 'Start', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Motor')).toBe(true)

    const pulse = () => {
      writeTag(project, engine, resolve, 'Sensor', true)
      engine.scan(20)
      writeTag(project, engine, resolve, 'Sensor', false)
      engine.scan(20)
    }
    for (let index = 0; index < 4; index += 1) pulse()
    expect(readTag(project, engine, resolve, 'Full')).toBe(false)

    pulse()
    expect(readTag(project, engine, resolve, 'Full')).toBe(true)

    // 复位输入清零计数，满箱指示随之复位。
    writeTag(project, engine, resolve, 'Reset', true)
    engine.scan(20)
    expect(readTag(project, engine, resolve, 'Full')).toBe(false)
  })
})
