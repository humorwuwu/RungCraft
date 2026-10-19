import { memo } from 'react'
import { usePowered, type TracePort } from './usePowered'

export interface LadderWireProps {
  /** 已加上画布内边距的绝对坐标串，父组件按布局变化时重算。 */
  points: string
  nodeId: string
  port: TracePort
  className?: string
}

/** 单根导线：独立订阅自己的能流位。 */
export const LadderWire = memo(function LadderWire({ points, nodeId, port, className }: LadderWireProps) {
  const on = usePowered(nodeId, port)
  return <polyline className={`ladder-wire ${on ? 'on' : ''} ${className ?? ''}`} points={points} />
})
