import { newId } from './ids'
import { createBox, createCoil, createContact, createSeries } from './ladderOps'
import { createProgramBlock, createProject, createTag } from './project'
import { baseType, type LadderNode, type Operand, type Project } from './types'

/**
 * 生成压力测试工程：用于验证大工程下的编译/扫描/布局性能基线。
 * 默认 500 个网络、每个网络 10 个元素（约 5000 个元素）。
 */
export function createStressProject(networkCount = 500, elementsPerNetwork = 10): Project {
  const project = createProject('压力测试工程')
  const table = project.tagTables[0]
  const start = createTag('Start', '%I0.0', baseType('BOOL'), '启动')
  const stop = createTag('Stop', '%I0.1', baseType('BOOL'), '停止')
  const sensor = createTag('Sensor', '%I0.2', baseType('BOOL'), '传感器')
  const motor = createTag('Motor', '%Q0.0', baseType('BOOL'), '电机')
  table.tags.push(start, stop, sensor, motor)

  // 每个网络用一组 M 位做中间量，避免所有网络互相干扰。
  const tag = (name: string, address: string): Operand => {
    const created = createTag(name, address, baseType('BOOL'))
    table.tags.push(created)
    return { kind: 'tag', tagId: created.id }
  }

  const ob = createProgramBlock('OB', 'Main', 1)
  ob.networks = Array.from({ length: networkCount }, (_, index) => {
    const children: LadderNode[] = []
    for (let step = 0; step < elementsPerNetwork - 1; step += 1) {
      children.push(createContact(step % 3 === 0 ? 'NC' : 'NO', step % 4 === 0 ? { kind: 'tag', tagId: start.id } : { kind: 'tag', tagId: sensor.id }))
    }
    // 每个网络一个定时器 + 一个线圈，覆盖有状态指令。
    children.splice(1, 0, createBox('box.TON', { PT: { kind: 'literal', dataType: 'TIME', value: 'T#1s' } }))
    children.push(createCoil('COIL', tag(`Net${index}_Out`, `%M${100 + index}.0`)))
    return { id: newId('net'), title: `网络 ${index + 1}`, comment: '', root: createSeries(children) }
  })
  project.blocks = [ob]

  project.watchTables.push({
    id: newId('wt'),
    name: '监视表 1',
    entries: [
      { id: newId('we'), operand: { kind: 'tag', tagId: start.id }, format: 'BOOL' },
      { id: newId('we'), operand: { kind: 'tag', tagId: motor.id }, format: 'BOOL' },
      { id: newId('we'), operand: { kind: 'tag', tagId: stop.id }, format: 'BOOL' },
    ],
  })
  return project
}
