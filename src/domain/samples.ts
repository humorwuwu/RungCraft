import {
  createConveyorSampleProject,
  createMotorSampleProject,
  createTankSampleProject,
  createTrafficLightSampleProject,
  createProject,
} from './project'
import type { Project } from './types'

export interface SampleDef {
  id: string
  name: string
  description: string
  /** 覆盖的指令/特性，用于示例选择界面展示。 */
  highlights: string
  create: () => Project
}

/** 内置示例工程；示例选择下拉与启动引导页共用。 */
export const SAMPLES: SampleDef[] = [
  {
    id: 'motor',
    name: '电机启停',
    description: '起保停自锁电路 + 运行指示灯。',
    highlights: '常开/常闭触点、自锁并联、线圈',
    create: createMotorSampleProject,
  },
  {
    id: 'traffic',
    name: '交通灯',
    description: '定时器产生相位脉冲，计数器循环相位，比较指令点灯。',
    highlights: 'TON、CTU、比较、DB 字段',
    create: createTrafficLightSampleProject,
  },
  {
    id: 'conveyor',
    name: '传送带计数',
    description: '启停自锁 + 光电上升沿计数 + 满箱指示。',
    highlights: '上升沿触点、CTU、比较、DB 字段',
    create: createConveyorSampleProject,
  },
  {
    id: 'tank',
    name: '水箱控制（FB+DB）',
    description: 'FB 封装模拟量比较，实例 DB 保存状态，UDT 记录快照。',
    highlights: 'FB/FC、实例 DB、UDT、模拟量比较、块调用',
    create: createTankSampleProject,
  },
]

export function findSample(id: string): SampleDef | undefined {
  return SAMPLES.find((sample) => sample.id === id)
}

/** 新建空白工程。 */
export function createBlankProject(): Project {
  return createProject()
}
