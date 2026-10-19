import { describe, expect, it } from 'vitest'
import { createMotorSampleProject, createProject, createTag, createTankSampleProject } from '@/domain/project'
import { baseType } from '@/domain/types'
import { compileProject, createOperandResolver } from './compile'

describe('编译器', () => {
  it('示例工程编译无错误并生成 trace 映射', () => {
    const project = createMotorSampleProject()
    const program = compileProject(project, 'test')
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)
    expect(program.traceSlotCount).toBeGreaterThan(0)
    const block = project.blocks[0]
    const firstNodeId = block.networks[0].root.id
    expect(program.blocks[0].networks[0].root.id).toBe(firstNodeId)
  })

  it('标签缺少地址时自动分配', () => {
    const project = createProject()
    project.tagTables[0].tags.push(createTag('NoAddr', '', baseType('BOOL')))
    const program = compileProject(project, 'test')
    expect(program.diagnostics.filter((item) => item.severity === 'error')).toHaveLength(0)
  })

  it('重复标签名产生错误诊断', () => {
    const project = createProject()
    project.tagTables[0].tags.push(createTag('Dup', '%I0.0', baseType('BOOL')))
    project.tagTables[0].tags.push(createTag('dup', '%I0.1', baseType('BOOL')))
    const program = compileProject(project, 'test')
    expect(program.diagnostics.some((item) => item.severity === 'error' && item.message.includes('重复'))).toBe(true)
  })

  it('水箱示例（FB + DB + 调用）编译无错误', () => {
    const project = createTankSampleProject()
    const program = compileProject(project, 'test')
    const errors = program.diagnostics.filter((item) => item.severity === 'error')
    expect(errors).toHaveLength(0)
  })

  it('操作数解析器可解析标签', () => {
    const project = createMotorSampleProject()
    const resolve = createOperandResolver(project)
    const tag = project.tagTables[0].tags[0]
    const ref = resolve({ kind: 'tag', tagId: tag.id })
    expect(ref?.kind).toBe('mem')
  })
})
