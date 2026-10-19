import { describe, expect, it } from 'vitest'
import { compileProject, createOperandResolver } from '@/compiler/compile'
import type { CompiledOperand } from '@/compiler/ir'
import { newId } from '@/domain/ids'
import { createBox, createCall, createCoil, createContact, createSeries } from '@/domain/ladderOps'
import { createDataBlock, createProgramBlock, createProject, createTag, createVarDecl } from '@/domain/project'
import { findTagByName } from '@/domain/projectIndex'
import { baseType, type DataBlock, type LadderNode, type Operand, type ProgramBlock, type Project } from '@/domain/types'
import { SimulationEngine } from './engine'

function network(root: LadderNode) {
  return { id: newId('net'), title: '', comment: '', root }
}

function prepare(project: Project) {
  const program = compileProject(project, 'test')
  const engine = new SimulationEngine(program)
  const resolve = createOperandResolver(project)
  return { program, engine, resolve }
}

function tagOperand(project: Project, name: string): Operand {
  const tag = findTagByName(project, name)
  if (!tag) throw new Error(`标签不存在: ${name}`)
  return { kind: 'tag', tagId: tag.id }
}

function read(engine: SimulationEngine, resolve: (operand: Operand) => CompiledOperand | undefined, operand: Operand): boolean | number {
  const ref = resolve(operand)
  if (!ref) throw new Error('无法解析操作数')
  return engine.memory.read(ref)
}

function write(engine: SimulationEngine, resolve: (operand: Operand) => CompiledOperand | undefined, operand: Operand, value: boolean | number): void {
  const ref = resolve(operand)
  if (!ref) throw new Error('无法解析操作数')
  engine.memory.write(ref, value)
}

describe('FC 调用', () => {
  it('通过输入/输出参数传递数据', () => {
    const project = createProject('FC 测试')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const source = createTag('Source', '%MW0', baseType('INT'))
    const result = createTag('Result', '%MW2', baseType('INT'))
    table.tags.push(start, source, result)

    const fc = createProgramBlock('FC', 'CopyValue', 2)
    fc.interface.inputs.push(createVarDecl('IN', baseType('INT')))
    fc.interface.outputs.push(createVarDecl('OUT', baseType('INT')))
    const inVar = fc.interface.inputs[0]
    const outVar = fc.interface.outputs[0]
    fc.networks = [
      network(
        createSeries([
          createBox('box.MOVE', {
            IN: { kind: 'local', blockId: fc.id, varId: inVar.id },
            OUT: { kind: 'local', blockId: fc.id, varId: outVar.id },
          }),
        ]),
      ),
    ]
    project.blocks.push(fc)

    const ob = project.blocks[0]
    ob.networks = [
      network(
        createSeries([
          createContact('NO', tagOperand(project, 'Start')),
          createCall(fc.id, undefined, { IN: tagOperand(project, 'Source'), OUT: tagOperand(project, 'Result') }),
        ]),
      ),
    ]

    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    write(engine, resolve, tagOperand(project, 'Source'), 5)
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(5)

    write(engine, resolve, tagOperand(project, 'Source'), 9)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(9)
  })
})

describe('FB 调用与实例隔离', () => {
  function buildProject(): { project: Project; fb: ProgramBlock; dbA: DataBlock; dbB: DataBlock } {
    const project = createProject('FB 测试')
    const table = project.tagTables[0]
    const inA = createTag('InA', '%I0.0', baseType('BOOL'))
    const inB = createTag('InB', '%I0.1', baseType('BOOL'))
    const outA = createTag('OutA', '%Q0.0', baseType('BOOL'))
    const outB = createTag('OutB', '%Q0.1', baseType('BOOL'))
    table.tags.push(inA, inB, outA, outB)

    const fb = createProgramBlock('FB', 'Latch', 2)
    fb.interface.inputs.push(createVarDecl('IN', baseType('BOOL')))
    fb.interface.outputs.push(createVarDecl('OUT', baseType('BOOL')))
    fb.interface.statics.push(createVarDecl('STATE', baseType('BOOL')))
    const inVar = fb.interface.inputs[0]
    const outVar = fb.interface.outputs[0]
    const stateVar = fb.interface.statics[0]
    fb.networks = [
      network(createSeries([createContact('NO', { kind: 'local', blockId: fb.id, varId: inVar.id }), createCoil('SET', { kind: 'local', blockId: fb.id, varId: stateVar.id })])),
      network(createSeries([createContact('NO', { kind: 'local', blockId: fb.id, varId: stateVar.id }), createCoil('COIL', { kind: 'local', blockId: fb.id, varId: outVar.id })])),
    ]
    project.blocks.push(fb)

    const makeInstance = (name: string, number: number): DataBlock => {
      const db = createDataBlock(name, number, 'instance')
      db.instanceOf = fb.id
      db.fields = [...fb.interface.inputs, ...fb.interface.outputs, ...fb.interface.statics].map((variable) =>
        createVarDecl(variable.name, variable.dataType),
      )
      project.dataBlocks.push(db)
      return db
    }
    const dbA = makeInstance('Latch_A', 1)
    const dbB = makeInstance('Latch_B', 2)

    const ob = project.blocks[0]
    ob.networks = [
      network(createSeries([createCall(fb.id, dbA.id, { IN: tagOperand(project, 'InA'), OUT: tagOperand(project, 'OutA') })])),
      network(createSeries([createCall(fb.id, dbB.id, { IN: tagOperand(project, 'InB'), OUT: tagOperand(project, 'OutB') })])),
    ]
    return { project, fb, dbA, dbB }
  }

  it('两个实例的静态变量互不影响', () => {
    const { project } = buildProject()
    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    write(engine, resolve, tagOperand(project, 'InA'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutA'))).toBe(true)
    expect(read(engine, resolve, tagOperand(project, 'OutB'))).toBe(false)

    // 断开输入后静态变量保持置位
    write(engine, resolve, tagOperand(project, 'InA'), false)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutA'))).toBe(true)

    write(engine, resolve, tagOperand(project, 'InB'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutB'))).toBe(true)
  })
})

describe('多重实例 FB', () => {
  it('FB 通过静态实例变量调用另一个 FB', () => {
    const project = createProject('多重实例测试')
    const table = project.tagTables[0]
    const inA = createTag('InA', '%I0.0', baseType('BOOL'))
    const inB = createTag('InB', '%I0.1', baseType('BOOL'))
    const outA = createTag('OutA', '%Q0.0', baseType('BOOL'))
    const outB = createTag('OutB', '%Q0.1', baseType('BOOL'))
    table.tags.push(inA, inB, outA, outB)

    // 内层 FB：置位保持
    const latch = createProgramBlock('FB', 'Latch', 2)
    latch.interface.inputs.push(createVarDecl('IN', baseType('BOOL')))
    latch.interface.outputs.push(createVarDecl('OUT', baseType('BOOL')))
    latch.interface.statics.push(createVarDecl('STATE', baseType('BOOL')))
    const latchIn = latch.interface.inputs[0]
    const latchOut = latch.interface.outputs[0]
    const latchState = latch.interface.statics[0]
    latch.networks = [
      network(
        createSeries([
          createContact('NO', { kind: 'local', blockId: latch.id, varId: latchIn.id }),
          createCoil('SET', { kind: 'local', blockId: latch.id, varId: latchState.id }),
        ]),
      ),
      network(
        createSeries([
          createContact('NO', { kind: 'local', blockId: latch.id, varId: latchState.id }),
          createCoil('COIL', { kind: 'local', blockId: latch.id, varId: latchOut.id }),
        ]),
      ),
    ]
    project.blocks.push(latch)

    // 外层 FB：静态实例变量调用内层 FB
    const wrapper = createProgramBlock('FB', 'Wrapper', 3)
    wrapper.interface.inputs.push(createVarDecl('IN', baseType('BOOL')))
    wrapper.interface.outputs.push(createVarDecl('OUT', baseType('BOOL')))
    const innerVar = createVarDecl('Inner', { kind: 'instance', blockId: latch.id })
    wrapper.interface.statics.push(innerVar)
    const wrapperIn = wrapper.interface.inputs[0]
    const wrapperOut = wrapper.interface.outputs[0]
    wrapper.networks = [
      network(
        createSeries([
          createCall(latch.id, undefined, { IN: { kind: 'local', blockId: wrapper.id, varId: wrapperIn.id }, OUT: { kind: 'local', blockId: wrapper.id, varId: wrapperOut.id } }, {
            kind: 'local',
            blockId: wrapper.id,
            varId: innerVar.id,
          }),
        ]),
      ),
    ]
    project.blocks.push(wrapper)

    const makeInstance = (name: string, number: number): DataBlock => {
      const db = createDataBlock(name, number, 'instance')
      db.instanceOf = wrapper.id
      db.fields = [...wrapper.interface.inputs, ...wrapper.interface.outputs, ...wrapper.interface.statics].map((variable) =>
        createVarDecl(variable.name, variable.dataType),
      )
      project.dataBlocks.push(db)
      return db
    }
    const dbA = makeInstance('Wrapper_A', 1)
    const dbB = makeInstance('Wrapper_B', 2)

    const ob = project.blocks[0]
    ob.networks = [
      network(createSeries([createCall(wrapper.id, dbA.id, { IN: tagOperand(project, 'InA'), OUT: tagOperand(project, 'OutA') })])),
      network(createSeries([createCall(wrapper.id, dbB.id, { IN: tagOperand(project, 'InB'), OUT: tagOperand(project, 'OutB') })])),
    ]

    const { program, engine, resolve } = prepare(project)
    const errors = program.diagnostics.filter((item) => item.severity === 'error')
    expect(errors).toHaveLength(0)

    write(engine, resolve, tagOperand(project, 'InA'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutA'))).toBe(true)
    expect(read(engine, resolve, tagOperand(project, 'OutB'))).toBe(false)

    write(engine, resolve, tagOperand(project, 'InA'), false)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutA'))).toBe(true)

    write(engine, resolve, tagOperand(project, 'InB'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'OutB'))).toBe(true)
  })
})

describe('数据块字段', () => {
  it('可以通过 DB 字段读写', () => {
    const project = createProject('DB 测试')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const result = createTag('Result', '%MW0', baseType('INT'))
    table.tags.push(start, result)

    const db = createDataBlock('Data', 1)
    db.fields.push(createVarDecl('Speed', baseType('INT')))
    project.dataBlocks.push(db)
    const speedOperand: Operand = { kind: 'dbField', dbId: db.id, path: ['Speed'] }

    project.blocks[0].networks = [
      network(
        createSeries([
          createContact('NO', tagOperand(project, 'Start')),
          createBox('box.MOVE', { IN: speedOperand, OUT: tagOperand(project, 'Result') }),
        ]),
      ),
    ]

    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    write(engine, resolve, speedOperand, 11)
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(11)
  })

  it('可以访问结构体字段', () => {
    const project = createProject('结构体测试')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const result = createTag('Result', '%MW0', baseType('INT'))
    table.tags.push(start, result)

    const db = createDataBlock('Data', 1)
    db.fields.push({
      id: 'info',
      name: 'Info',
      dataType: {
        kind: 'struct',
        fields: [createVarDecl('Speed', baseType('INT')), createVarDecl('Flag', baseType('BOOL'))],
      },
    })
    project.dataBlocks.push(db)
    const speedOperand: Operand = { kind: 'dbField', dbId: db.id, path: ['Info', 'Speed'] }
    const flagOperand: Operand = { kind: 'dbField', dbId: db.id, path: ['Info', 'Flag'] }

    project.blocks[0].networks = [
      network(
        createSeries([
          createContact('NO', tagOperand(project, 'Start')),
          createBox('box.MOVE', { IN: speedOperand, OUT: tagOperand(project, 'Result') }),
        ]),
      ),
    ]

    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    write(engine, resolve, speedOperand, 42)
    write(engine, resolve, flagOperand, true)
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(42)
    expect(read(engine, resolve, flagOperand)).toBe(true)
  })

  it('可以访问结构体数组元素字段', () => {
    const project = createProject('结构体数组测试')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const result = createTag('Result', '%MW0', baseType('INT'))
    table.tags.push(start, result)

    const db = createDataBlock('Data', 1)
    db.fields.push({
      id: 'items',
      name: 'Items',
      dataType: {
        kind: 'array',
        length: 3,
        element: { kind: 'struct', fields: [createVarDecl('Value', baseType('INT')), createVarDecl('Used', baseType('BOOL'))] },
      },
    })
    project.dataBlocks.push(db)
    const itemOperand: Operand = { kind: 'dbField', dbId: db.id, path: ['Items', '1', 'Value'] }

    project.blocks[0].networks = [
      network(
        createSeries([
          createContact('NO', tagOperand(project, 'Start')),
          createBox('box.MOVE', { IN: itemOperand, OUT: tagOperand(project, 'Result') }),
        ]),
      ),
    ]

    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    write(engine, resolve, itemOperand, 77)
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(77)
  })
})
