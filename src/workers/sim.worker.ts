import { compileProject, createOperandResolver } from '@/compiler/compile'
import type { CompiledNode, CompiledOperand, CompiledProgram } from '@/compiler/ir'
import { SimulationEngine } from '@/runtime/engine'
import type { Operand, Project } from '@/domain/types'
import type { ForceEntry, MainToWorker, SimulationMode, SubscribeEntry, WorkerStatus, WorkerToMain } from './protocol'
import { PROTOCOL_VERSION } from './protocol'

interface WorkerScope {
  postMessage(message: WorkerToMain, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<MainToWorker>) => void) | null
}

const ctx = self as unknown as WorkerScope

let project: Project | undefined
let program: CompiledProgram | undefined
let engine: SimulationEngine | undefined
let resolveOperand: ((operand: Operand) => CompiledOperand | undefined) | undefined

let mode: SimulationMode = 'stopped'
let scanTimeMs = 20
let speed = 1
let lastScanMs = 0
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
let subscriptions: SubscribeEntry[] = []
let forces: ForceEntry[] = []
let buildId: string | undefined

function status(): WorkerStatus {
  return {
    mode,
    buildId,
    scanCount: engine?.scanCount ?? 0,
    simTimeMs: engine?.simTimeMs ?? 0,
    lastScanMs,
    scanTimeMs,
    speed,
  }
}

function postStatus(): void {
  ctx.postMessage({ type: 'status', status: status() })
}

function postSnapshot(): void {
  if (!engine || !resolveOperand) {
    ctx.postMessage({ type: 'status', status: status() })
    return
  }
  const values: Record<string, boolean | number> = {}
  for (const entry of subscriptions) {
    const ref = resolveOperand(entry.operand)
    if (!ref) continue
    values[entry.key] = engine.memory.read(ref)
  }
  seq += 1
  const trace = engine.trace.slice()
  ctx.postMessage(
    {
      type: 'snapshot',
      seq,
      status: status(),
      trace: trace.buffer,
      values,
      diagnostics: engine.diagnostics.slice(),
      states: engine.topLevelBoxStates(),
    },
    [trace.buffer],
  )
}

function applyForces(phase: 'input' | 'output'): void {
  if (!engine || !resolveOperand) return
  for (const force of forces) {
    const ref = resolveOperand(force.operand)
    if (!ref || ref.kind !== 'mem') continue
    const isInput = ref.area === 'I'
    const isOutput = ref.area === 'Q'
    if (phase === 'input' && isInput) engine.memory.write(ref, force.value)
    if (phase === 'output' && isOutput) engine.memory.write(ref, force.value)
  }
}

function runScan(): void {
  if (!engine) return
  applyForces('input')
  const started = performance.now()
  engine.scan(scanTimeMs)
  lastScanMs = performance.now() - started
  applyForces('output')
}

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer)
  const interval = Math.max(1, scanTimeMs / Math.max(0.1, speed))
  timer = setTimeout(() => {
    if (mode !== 'running') return
    runScan()
    postSnapshot()
    schedule()
  }, interval)
}

function stopTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

function handleDownload(message: Extract<MainToWorker, { type: 'download' }>): void {
  stopTimer()
  mode = 'stopped'
  project = message.project
  buildId = message.buildId
  program = compileProject(project, buildId)
  engine = new SimulationEngine(program)
  resolveOperand = createOperandResolver(project)
  forces = []
  const hasErrors = program.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  ctx.postMessage({
    type: 'compileResult',
    buildId,
    diagnostics: program.diagnostics,
    traceMap: traceMapOf(program),
    hasErrors,
  })
  postStatus()
  postSnapshot()
}

function traceMapOf(compiled: CompiledProgram): Record<string, { inSlot: number; outSlot: number }> {
  const map: Record<string, { inSlot: number; outSlot: number }> = {}
  for (const block of compiled.blocks) {
    for (const network of block.networks) {
      collectTrace(network.root, map)
    }
  }
  return map
}

function collectTrace(node: CompiledNode, map: Record<string, { inSlot: number; outSlot: number }>): void {
  map[node.id] = node.trace
  if (node.kind === 'series' || node.kind === 'parallel') {
    for (const child of node.children) collectTrace(child, map)
  }
}

ctx.onmessage = (event: MessageEvent<MainToWorker>) => {
  const message = event.data
  try {
    switch (message.type) {
      case 'download':
        handleDownload(message)
        break
      case 'run':
        if (!engine || !program) return
        if (program.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
          ctx.postMessage({ type: 'error', message: '工程存在编译错误，无法启动仿真。' })
          return
        }
        mode = 'running'
        schedule()
        postStatus()
        break
      case 'pause':
        mode = 'paused'
        stopTimer()
        postStatus()
        postSnapshot()
        break
      case 'stop':
        mode = 'stopped'
        stopTimer()
        postStatus()
        postSnapshot()
        break
      case 'step':
        if (!engine) return
        mode = 'paused'
        stopTimer()
        runScan()
        postStatus()
        postSnapshot()
        break
      case 'reset':
        engine?.reset()
        forces = []
        postStatus()
        postSnapshot()
        break
      case 'setScanTime':
        scanTimeMs = Math.max(1, message.scanTimeMs)
        postStatus()
        if (mode === 'running') schedule()
        break
      case 'setSpeed':
        speed = Math.max(0.1, message.speed)
        postStatus()
        if (mode === 'running') schedule()
        break
      case 'subscribe':
        subscriptions = message.entries
        postSnapshot()
        break
      case 'force':
        for (const entry of message.entries) {
          const index = forces.findIndex((item) => item.key === entry.key)
          if (index >= 0) forces[index] = entry
          else forces.push(entry)
        }
        postSnapshot()
        break
      case 'releaseForce':
        forces = forces.filter((force) => !message.keys.includes(force.key))
        postSnapshot()
        break
      case 'write': {
        if (!engine || !resolveOperand) return
        const ref = resolveOperand(message.operand)
        if (ref) engine.memory.write(ref, message.value)
        postSnapshot()
        break
      }
      default:
        break
    }
  } catch (error) {
    ctx.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

ctx.postMessage({ type: 'ready', protocolVersion: PROTOCOL_VERSION })
