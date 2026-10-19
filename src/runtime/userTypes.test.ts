import { describe, expect, it } from 'vitest'
import { compileProject, createOperandResolver } from '@/compiler/compile'
import type { CompiledOperand } from '@/compiler/ir'
import { newId } from '@/domain/ids'
import { createBox, createCoil, createContact, createSeries } from '@/domain/ladderOps'
import { createDataBlock, createProgramBlock, createProject, createTag, createUdt, createVarDecl } from '@/domain/project'
import { findTagByName, resolveTypePath } from '@/domain/projectIndex'
import { collectFieldPaths } from '@/domain/typeOps'
import { baseType, type LadderNode, type Operand, type Project } from '@/domain/types'
import { typeExpanderFor } from '@/domain/userTypes'
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

/** 一个被复用的 UDT：Info { Speed: INT, Flag: BOOL, Limit: REAL }。 */
function makeInfoUdt(project: Project) {
  const udt = createUdt('Info')
  udt.fields = [
    createVarDecl('Speed', baseType('INT')),
    createVarDecl('Flag', baseType('BOOL')),
    createVarDecl('Limit', baseType('REAL')),
  ]
  project.userTypes.push(udt)
  return udt
}

describe('PLC 数据类型（UDT）', () => {
  it('数据块字段按 UDT 布局并可读写字段', () => {
    const project = createProject('UDT 数据块')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const result = createTag('Result', '%MW0', baseType('INT'))
    table.tags.push(start, result)

    const info = makeInfoUdt(project)
    const db = createDataBlock('Data', 1)
    db.fields.push({ id: 'f_info', name: 'Info', dataType: { kind: 'udt', udtId: info.id } })
    project.dataBlocks.push(db)

    const speedOperand: Operand = { kind: 'dbField', dbId: db.id, path: ['Info', 'Speed'] }
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

    const layout = program.dbs.find((item) => item.dbId === db.id)
    // Info.Speed(INT) 在 0，Info.Flag(BOOL) 在 2.0，Info.Limit(REAL) 对齐到 4。
    expect(layout?.fields.map((field) => [field.path.join('.'), field.offset, field.bit ?? 0])).toEqual([
      ['Info.Speed', 0, 0],
      ['Info.Flag', 2, 0],
      ['Info.Limit', 4, 0],
    ])

    write(engine, resolve, speedOperand, 123)
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(123)
  })

  it('支持 UDT 数组与嵌套 UDT', () => {
    const project = createProject('UDT 数组')
    const info = makeInfoUdt(project)
    const group = createUdt('Group')
    group.fields = [
      createVarDecl('Items', { kind: 'array', element: { kind: 'udt', udtId: info.id }, length: 2 }),
      createVarDecl('Info', { kind: 'udt', udtId: info.id }),
    ]
    project.userTypes.push(group)

    const db = createDataBlock('Data', 1)
    db.fields.push({ id: 'f_group', name: 'G', dataType: { kind: 'udt', udtId: group.id } })
    project.dataBlocks.push(db)

    const expand = typeExpanderFor(project)
    const paths = collectFieldPaths({ kind: 'udt', udtId: group.id }, ['G'], 0, expand).map((path) => path.join('.'))
    // 自动补全只展开数组下标 0 作为示例，其余下标由用户输入。
    expect(paths).toContain('G.Items.0.Speed')
    expect(paths).toContain('G.Items.0.Flag')
    expect(paths).toContain('G.Info.Limit')

    const type = resolveTypePath({ kind: 'udt', udtId: group.id }, ['Items', '1', 'Speed'], expand)
    expect(type).toEqual({ kind: 'base', type: 'INT' })

    const { program } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)
    const layout = program.dbs.find((item) => item.dbId === db.id)
    expect(layout?.fields.some((field) => field.path.join('.') === 'G.Items.1.Speed')).toBe(true)
  })

  it('FB 静态变量可以是 UDT，按实例隔离', () => {
    const project = createProject('UDT 静态变量')
    const table = project.tagTables[0]
    const start = createTag('Start', '%I0.0', baseType('BOOL'))
    const result = createTag('Result', '%MW0', baseType('INT'))
    table.tags.push(start, result)

    const info = makeInfoUdt(project)
    const fb = createProgramBlock('FB', 'Counter', 2)
    const state = createVarDecl('State', { kind: 'udt', udtId: info.id })
    fb.interface.statics.push(state)
    const count = createVarDecl('Count', baseType('INT'))
    fb.interface.inOuts.push(count)
    fb.networks = [
      network(
        createSeries([
          createBox('box.MATH_ADD', {
            IN1: { kind: 'local', blockId: fb.id, varId: count.id },
            IN2: { kind: 'literal', dataType: 'INT', value: 1 },
            OUT: { kind: 'local', blockId: fb.id, varId: count.id },
          }),
          createCoil('COIL', { kind: 'local', blockId: fb.id, varId: state.id, path: ['Flag'] }),
        ]),
      ),
    ]
    project.blocks.push(fb)

    const instanceDb = createDataBlock('Counter_DB', 1, 'instance')
    instanceDb.instanceOf = fb.id
    // 实例 DB 的字段顺序必须与 FB 接口顺序一致（inputs/outputs/inOuts/statics），
    // 这样实例 DB 布局与块内 INST 布局的偏移才会逐字段对齐。
    instanceDb.fields = [createVarDecl('Count', baseType('INT')), createVarDecl('State', { kind: 'udt', udtId: info.id })]
    project.dataBlocks.push(instanceDb)

    project.blocks[0].networks = [
      network(
        createSeries([
          createContact('NO', tagOperand(project, 'Start')),
          {
            id: newId('call'),
            kind: 'call',
            blockId: fb.id,
            instanceDbId: instanceDb.id,
            bindings: { Count: tagOperand(project, 'Result') },
            en: false,
            eno: false,
          },
        ]),
      ),
    ]

    const { program, engine, resolve } = prepare(project)
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)

    const flagOperand: Operand = { kind: 'dbField', dbId: instanceDb.id, path: ['State', 'Flag'] }
    write(engine, resolve, tagOperand(project, 'Start'), true)
    engine.scan(20)
    expect(read(engine, resolve, tagOperand(project, 'Result'))).toBe(1)
    // FB 内对 #State.Flag 的写入落到实例 DB 的 State.Flag 字段上。
    expect(read(engine, resolve, flagOperand)).toBe(true)
  })

  it('缺少 UDT 列表的旧工程仍可编译（v1 兼容）', () => {
    const project = createProject('旧工程')
    const db = createDataBlock('Data', 1)
    db.fields.push(createVarDecl('Value', baseType('INT')))
    project.dataBlocks.push(db)
    // 模拟 v1 工程：没有 userTypes 字段。
    delete (project as { userTypes?: unknown }).userTypes

    const program = compileProject(project, 'test')
    expect(program.diagnostics.filter((item) => item.severity === 'error').map((item) => item.message)).not.toContain(
      expect.stringContaining('PLC 数据类型'),
    )
    expect(program.dbs.find((item) => item.dbId === db.id)?.fields).toHaveLength(1)
  })

  it('未知 UDT 引用与循环引用会被编译诊断捕获', () => {
    const project = createProject('UDT 诊断')
    const db = createDataBlock('Data', 1)
    db.fields.push({ id: 'f_bad', name: 'Bad', dataType: { kind: 'udt', udtId: 'udt_missing' } })
    project.dataBlocks.push(db)

    const a = createUdt('A')
    a.fields = [createVarDecl('B', { kind: 'udt', udtId: 'placeholder' })]
    const b = createUdt('B')
    b.fields = [createVarDecl('A', { kind: 'udt', udtId: a.id })]
    a.fields[0].dataType = { kind: 'udt', udtId: b.id }
    project.userTypes.push(a, b)

    const program = compileProject(project, 'test')
    const messages = program.diagnostics.filter((item) => item.severity === 'error').map((item) => item.message)
    expect(messages.some((message) => message.includes('不存在的 PLC 数据类型'))).toBe(true)
    expect(messages.some((message) => message.includes('循环引用'))).toBe(true)
  })
})
