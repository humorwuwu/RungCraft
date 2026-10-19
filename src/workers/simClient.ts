import { operandKey } from '@/domain/operand'
import { allTags } from '@/domain/projectIndex'
import { collectFieldPaths } from '@/domain/typeOps'
import { typeExpanderFor } from '@/domain/userTypes'
import type { Operand, Project } from '@/domain/types'
import { notify } from '@/store/notificationStore'
import { useSimulationStore } from '@/store/simulationStore'
import { useUiStore } from '@/store/uiStore'
import type { ForceEntry, MainToWorker, SubscribeEntry, WorkerToMain } from './protocol'
import { PROTOCOL_VERSION } from './protocol'

class SimulationClient {
  private worker?: Worker
  private buildId?: string

  connect(): void {
    if (this.worker) return
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => this.handle(event.data)
    this.worker.onerror = (event) => {
      useSimulationStore.getState().setError(event.message || '仿真 Worker 发生错误。')
    }
  }

  private handle(message: WorkerToMain): void {
    const store = useSimulationStore.getState()
    switch (message.type) {
      case 'ready':
        store.setConnected(true)
        break
      case 'compileResult': {
        store.setCompileResult(message)
        const errors = message.diagnostics.filter((item) => item.severity === 'error').length
        const warnings = message.diagnostics.filter((item) => item.severity === 'warning').length
        if (errors > 0) {
          // 编译失败时把诊断面板顶到前台，避免用户找不到错误。
          useUiStore.getState().setBottomTab('problems')
          notify(`编译失败：${errors} 个错误${warnings ? `，${warnings} 个警告` : ''}。`, 'error')
        } else {
          notify(warnings > 0 ? `编译通过，有 ${warnings} 个警告。` : '编译通过，已下载到仿真器。', warnings > 0 ? 'warning' : 'success')
        }
        break
      }
      case 'status':
        store.setStatus(message.status)
        break
      case 'snapshot':
        store.setSnapshot({
          trace: new Uint8Array(message.trace),
          values: message.values,
          diagnostics: message.diagnostics,
          states: message.states,
        })
        store.setStatus(message.status)
        break
      case 'error':
        store.setError(message.message)
        break
    }
  }

  private send(message: MainToWorker): void {
    this.connect()
    this.worker?.postMessage(message)
  }

  download(project: Project, buildId: string): void {
    this.buildId = buildId
    useSimulationStore.getState().setForces([])
    this.send({ type: 'download', protocolVersion: PROTOCOL_VERSION, project, buildId })
    this.subscribeAll(project)
  }

  private subscribeAll(project: Project): void {
    const entries: SubscribeEntry[] = []
    const seen = new Set<string>()
    const add = (operand: Operand) => {
      const key = operandKey(operand)
      if (seen.has(key)) return
      seen.add(key)
      entries.push({ key, operand })
    }
    const expand = typeExpanderFor(project)
    for (const tag of allTags(project)) add({ kind: 'tag', tagId: tag.id })
    for (const db of project.dataBlocks) {
      for (const field of db.fields) {
        for (const path of collectFieldPaths(field.dataType, [field.name], 0, expand)) {
          add({ kind: 'dbField', dbId: db.id, path })
        }
      }
    }
    for (const table of project.watchTables) {
      for (const entry of table.entries) add(entry.operand)
    }
    this.send({ type: 'subscribe', entries })
  }

  run(): void {
    this.send({ type: 'run' })
  }

  pause(): void {
    this.send({ type: 'pause' })
  }

  step(): void {
    this.send({ type: 'step' })
  }

  stop(): void {
    this.send({ type: 'stop' })
  }

  reset(): void {
    this.send({ type: 'reset' })
  }

  setScanTime(scanTimeMs: number): void {
    useSimulationStore.getState().setScanTime(scanTimeMs)
    this.send({ type: 'setScanTime', scanTimeMs })
  }

  setSpeed(speed: number): void {
    useSimulationStore.getState().setSpeed(speed)
    this.send({ type: 'setSpeed', speed })
  }

  force(entry: ForceEntry): void {
    this.send({ type: 'force', entries: [entry] })
  }

  releaseForce(keys: string[]): void {
    this.send({ type: 'releaseForce', keys })
  }

  write(operand: Operand, value: boolean | number): void {
    this.send({ type: 'write', operand, value })
  }

  getBuildId(): string | undefined {
    return this.buildId
  }
}

export const simClient = new SimulationClient()
