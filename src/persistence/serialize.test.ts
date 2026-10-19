import { describe, expect, it } from 'vitest'
import { createMotorSampleProject, createTankSampleProject, SCHEMA_VERSION } from '@/domain/project'
import { exportProjectFile, parseProjectFile } from './serialize'

describe('工程导入导出', () => {
  it('导出后可以无损导入', () => {
    const project = createMotorSampleProject()
    const text = exportProjectFile(project)
    const result = parseProjectFile(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.name).toBe(project.name)
      expect(result.project.tagTables[0].tags).toHaveLength(project.tagTables[0].tags.length)
      expect(result.project.blocks[0].networks).toHaveLength(project.blocks[0].networks.length)
    }
  })

  it('拒绝非法 JSON', () => {
    const result = parseProjectFile('{ not json')
    expect(result.ok).toBe(false)
  })

  it('拒绝未来 schema 版本', () => {
    const project = createMotorSampleProject()
    const envelope = JSON.parse(exportProjectFile(project))
    envelope.schemaVersion = 99
    const result = parseProjectFile(JSON.stringify(envelope))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('版本')
  })

  it('拒绝字段缺失的工程', () => {
    const result = parseProjectFile(JSON.stringify({ fileType: 'lad-project', schemaVersion: 1, project: { id: 'x' } }))
    expect(result.ok).toBe(false)
  })

  it('v1 工程缺少 UDT 列表时迁移到当前版本', () => {
    const project = createMotorSampleProject()
    const envelope = JSON.parse(exportProjectFile(project))
    envelope.schemaVersion = 1
    envelope.project.schemaVersion = 1
    delete envelope.project.userTypes
    const result = parseProjectFile(JSON.stringify(envelope))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.userTypes).toEqual([])
      expect(result.project.schemaVersion).toBe(SCHEMA_VERSION)
    }
  })

  it('UDT 定义与引用可以往返导出导入', () => {
    const project = createTankSampleProject()
    const result = parseProjectFile(exportProjectFile(project))
    expect(result.ok).toBe(true)
    if (result.ok) {
      const udt = result.project.userTypes.find((item) => item.name === 'TankInfo')
      expect(udt?.fields.map((field) => field.name)).toEqual(['Level', 'Setpoint', 'Pump'])
      const db = result.project.dataBlocks.find((item) => item.name === 'TankData')
      expect(db?.fields.some((field) => field.dataType.kind === 'udt')).toBe(true)
    }
  })
})
