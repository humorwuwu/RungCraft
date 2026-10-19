import type { Diagnostic } from '@/compiler/ir'
import type { Operand, Project } from '@/domain/types'

export const PROTOCOL_VERSION = 1

export type SimulationMode = 'stopped' | 'running' | 'paused'

export interface SubscribeEntry {
  key: string
  operand: Operand
}

export interface ForceEntry {
  key: string
  operand: Operand
  value: boolean | number
}

export type MainToWorker =
  | { type: 'download'; protocolVersion: number; project: Project; buildId: string }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'setScanTime'; scanTimeMs: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'subscribe'; entries: SubscribeEntry[] }
  | { type: 'force'; entries: ForceEntry[] }
  | { type: 'releaseForce'; keys: string[] }
  | { type: 'write'; operand: Operand; value: boolean | number }

export interface WorkerStatus {
  mode: SimulationMode
  buildId?: string
  scanCount: number
  simTimeMs: number
  lastScanMs: number
  scanTimeMs: number
  speed: number
}

export type WorkerToMain =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'compileResult'; buildId: string; diagnostics: Diagnostic[]; traceMap: Record<string, { inSlot: number; outSlot: number }>; hasErrors: boolean }
  | { type: 'status'; status: WorkerStatus }
  | {
      type: 'snapshot'
      seq: number
      status: WorkerStatus
      trace: ArrayBuffer
      values: Record<string, boolean | number>
      diagnostics: Diagnostic[]
      states: Record<string, { q?: boolean; et?: number; cv?: number }>
    }
  | { type: 'error'; message: string }
