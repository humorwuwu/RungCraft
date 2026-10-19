import type {
  CallParamSlot,
  CompiledBox,
  CompiledCall,
  CompiledNetwork,
  CompiledNode,
  CompiledOperand,
  CompiledProgram,
  Diagnostic,
  MemoryRef,
} from '@/compiler/ir'
import { ProcessMemory } from './memory'

interface TimerState {
  et: number
  q: boolean
  running: boolean
}

interface CounterState {
  cv: number
  prev: boolean
  prevCd: boolean
}

export interface BoxRuntimeState {
  q?: boolean
  et?: number
  cv?: number
}

export interface EngineSnapshot {
  scanCount: number
  simTimeMs: number
  trace: Uint8Array
  diagnostics: Diagnostic[]
  states: Record<string, BoxRuntimeState>
}

/**
 * 扫描周期仿真引擎：纯 TS、无 DOM，可在 Node 中直接测试。
 * 每个扫描周期推进固定的 scanTimeMs，定时器/计数器按实例隔离。
 */
export class SimulationEngine {
  readonly program: CompiledProgram
  memory: ProcessMemory
  trace: Uint8Array
  scanCount = 0
  simTimeMs = 0
  diagnostics: Diagnostic[] = []

  private edges = new Map<string, boolean>()
  private timers = new Map<string, TimerState>()
  private counters = new Map<string, CounterState>()
  private boxStates = new Map<string, BoxRuntimeState>()
  private pendingJump?: string
  /** 调用作用域栈：FB 用实例 DB id，FC 用调用点 id，保证状态按实例隔离。 */
  private scopeStack: string[] = []
  private frameBase = 0
  private frameTop = 0

  constructor(program: CompiledProgram) {
    this.program = program
    this.memory = this.createMemory()
    this.trace = new Uint8Array(program.traceSlotCount)
  }

  private createMemory(): ProcessMemory {
    return new ProcessMemory(
      this.program.memorySizes,
      this.program.dbs.map((db) => ({ dbId: db.dbId, sizeBytes: db.sizeBytes })),
    )
  }

  reset(): void {
    this.memory = this.createMemory()
    this.trace = new Uint8Array(this.program.traceSlotCount)
    this.edges.clear()
    this.timers.clear()
    this.counters.clear()
    this.boxStates.clear()
    this.pendingJump = undefined
    this.scopeStack = []
    this.frameBase = 0
    this.frameTop = 0
    this.scanCount = 0
    this.simTimeMs = 0
    this.diagnostics = []
  }

  private stateKey(nodeId: string): string {
    return `${this.scopeStack.join('/')}#${nodeId}`
  }

  /** 执行一次扫描。 */
  scan(scanTimeMs: number): void {
    this.simTimeMs += scanTimeMs
    this.scanCount += 1
    this.diagnostics = []
    this.scopeStack = []
    this.frameBase = 0
    this.frameTop = 0
    this.memory.frameBase = 0
    this.memory.setInstanceDb(undefined)
    for (const block of this.program.blocks) {
      if (block.kind !== 'OB') continue
      this.executeBlock(block, scanTimeMs)
    }
  }

  /** 按网络顺序执行一个块，并处理 JMP/LABEL 跳转。 */
  private executeBlock(block: CompiledProgram['blocks'][number], scanTimeMs: number): void {
    const previousJump = this.pendingJump
    this.pendingJump = undefined
    let index = 0
    let steps = 0
    while (index < block.networks.length) {
      steps += 1
      if (steps > 10_000) {
        this.reportRuntime('块内跳转次数过多，可能存在死循环。', block.id)
        break
      }
      this.pendingJump = undefined
      this.executeNetwork(block.networks[index], scanTimeMs)
      const jump = this.pendingJump
      if (jump) {
        const target = block.labels[jump]
        if (target === undefined) {
          this.reportRuntime(`跳转目标 ${jump} 不存在。`, block.id)
          break
        }
        index = target
      } else {
        index += 1
      }
    }
    this.pendingJump = previousJump
  }

  private executeNetwork(network: CompiledNetwork, scanTimeMs: number): void {
    this.evalNode(network.root, true, scanTimeMs)
  }

  private setTrace(slot: number, value: boolean): void {
    if (slot >= 0 && slot < this.trace.length) this.trace[slot] = value ? 1 : 0
  }

  private evalNode(node: CompiledNode, powerIn: boolean, scanTimeMs: number): boolean {
    this.setTrace(node.trace.inSlot, powerIn)
    let out: boolean
    switch (node.kind) {
      case 'series': {
        let power = powerIn
        for (const child of node.children) {
          power = this.evalNode(child, power, scanTimeMs)
        }
        out = power
        break
      }
      case 'parallel': {
        let any = false
        for (const child of node.children) {
          const childOut = this.evalNode(child, powerIn, scanTimeMs)
          any = any || childOut
        }
        out = any
        break
      }
      case 'contact':
        out = this.evalContact(this.stateKey(node.id), node.variant, node.operand, powerIn)
        break
      case 'coil':
        this.evalCoil(this.stateKey(node.id), node.variant, node.operand, powerIn)
        out = powerIn
        break
      case 'box':
        out = this.evalBox(node, powerIn, scanTimeMs)
        break
      case 'call':
        out = this.evalCall(node, powerIn, scanTimeMs)
        break
    }
    this.setTrace(node.trace.outSlot, out)
    return out
  }

  private evalContact(id: string, variant: string, operand: CompiledOperand, powerIn: boolean): boolean {
    const value = this.memory.readBoolRef(operand)
    switch (variant) {
      case 'NC':
        return powerIn && !value
      case 'P': {
        const previous = this.edges.get(id) ?? false
        this.edges.set(id, value)
        return powerIn && value && !previous
      }
      case 'N': {
        const previous = this.edges.get(id) ?? false
        this.edges.set(id, value)
        return powerIn && !value && previous
      }
      case 'NO':
      default:
        return powerIn && value
    }
  }

  private evalCoil(id: string, variant: string, operand: CompiledOperand, powerIn: boolean): void {
    switch (variant) {
      case 'COIL_NEG':
        this.memory.write(operand, !powerIn)
        return
      case 'SET':
        if (powerIn) this.memory.write(operand, true)
        return
      case 'RESET':
        if (powerIn) this.memory.write(operand, false)
        return
      case 'EDGE_P': {
        const previous = this.edges.get(id) ?? false
        this.edges.set(id, powerIn)
        if (powerIn && !previous) this.memory.write(operand, true)
        else this.memory.write(operand, false)
        return
      }
      case 'EDGE_N': {
        const previous = this.edges.get(id) ?? false
        this.edges.set(id, powerIn)
        if (!powerIn && previous) this.memory.write(operand, true)
        else this.memory.write(operand, false)
        return
      }
      case 'COIL':
      default:
        this.memory.write(operand, powerIn)
    }
  }

  /* ---------------------------------------------------------------- */
  /* 功能框                                                            */
  /* ---------------------------------------------------------------- */

  private readBoolParam(box: CompiledBox, name: string, fallback: boolean): boolean {
    const operand = box.params[name]
    if (!operand) return fallback
    return this.memory.readBoolRef(operand)
  }

  private readNumberParam(box: CompiledBox, name: string, fallback: number): number {
    const operand = box.params[name]
    if (!operand) return fallback
    const value = this.memory.read(operand)
    return typeof value === 'boolean' ? (value ? 1 : 0) : value
  }

  private writeParam(box: CompiledBox, name: string, value: boolean | number): void {
    const operand = box.params[name]
    if (!operand) return
    this.memory.write(operand, value)
  }

  private evalBox(box: CompiledBox, powerIn: boolean, scanTimeMs: number): boolean {
    const enabled = box.en ? powerIn : true
    switch (box.handler) {
      case 'TON':
      case 'TOF':
      case 'TP':
        return this.evalTimer(box, enabled, scanTimeMs)
      case 'CTU':
      case 'CTD':
      case 'CTUD':
        return this.evalCounter(box, enabled)
      case 'CMP':
        return enabled && this.evalCompare(box)
      case 'MATH':
      case 'ABS':
      case 'MINMAX':
        return enabled && this.evalMath(box)
      case 'MOVE':
        if (enabled) this.evalMove(box)
        return enabled
      case 'CONVERT':
      case 'ROUND':
      case 'TRUNC':
        if (enabled) this.evalConvert(box)
        return enabled
      case 'SHIFT':
      case 'WORD':
        if (enabled) this.evalBitwise(box)
        return enabled
      case 'JMP':
        if (enabled && box.label?.trim()) this.pendingJump = box.label.trim()
        return enabled
      case 'LABEL':
        return enabled
      default:
        return enabled
    }
  }

  /* ---------------------------------------------------------------- */
  /* 块调用                                                            */
  /* ---------------------------------------------------------------- */

  private slotRef(slot: CallParamSlot, area: 'INST' | 'L'): MemoryRef {
    return {
      kind: 'mem',
      area,
      offset: slot.offset,
      bit: slot.width === 'bit' ? (slot.bit ?? 0) : undefined,
      width: slot.width,
      type: slot.type,
      writable: true,
      display: slot.name,
    }
  }

  private evalCall(call: CompiledCall, powerIn: boolean, scanTimeMs: number): boolean {
    const enabled = call.en ? powerIn : true
    if (!enabled) return false
    if (this.scopeStack.length > 64) {
      this.reportRuntime('块调用层级过深，已中止本次调用。', call.id)
      return false
    }
    const target = this.program.blocks.find((block) => block.id === call.targetBlockId)
    if (!target) return false

    // 1) 在调用者作用域内读取所有实参值，避免切换帧后引用错位。
    const inputValues = new Map<string, boolean | number>()
    for (const binding of call.bindings) {
      if (!binding.actual) continue
      if (binding.direction === 'input' || binding.direction === 'inout') {
        inputValues.set(binding.name, this.memory.read(binding.actual))
      }
    }

    // 2) 切换帧与实例。
    const previousFrameBase = this.frameBase
    const previousInstance = this.memory.getInstance()
    const base = this.frameTop
    this.frameTop += Math.max(0, target.frameSize)
    this.frameBase = base
    this.memory.frameBase = base
    if (target.frameSize > 0) this.memory.clearFrame(base, target.frameSize)

    let scopeKey: string
    if (target.kind === 'FB') {
      if (call.instanceRef && call.instanceRef.kind === 'mem') {
        const ref = call.instanceRef
        if (ref.area === 'INST') {
          this.memory.setInstance(previousInstance.dbId, previousInstance.base + ref.offset)
        } else if (ref.area === 'DB') {
          this.memory.setInstance(ref.dbId, ref.offset)
        }
        scopeKey = `mi:${call.id}`
      } else {
        this.memory.setInstance(call.instanceDbId, 0)
        scopeKey = call.instanceDbId ?? target.id
      }
    } else {
      scopeKey = `fc:${call.id}`
    }
    this.scopeStack.push(scopeKey)

    // 3) 写入输入/输入输出参数。
    for (const slot of target.params) {
      if (slot.direction !== 'input' && slot.direction !== 'inout') continue
      const value = inputValues.get(slot.name)
      if (value === undefined) continue
      const area: 'INST' | 'L' = target.kind === 'FB' ? 'INST' : 'L'
      this.memory.write(this.slotRef(slot, area), value)
    }

    // 4) 执行被调用块。
    this.executeBlock(target, scanTimeMs)

    // 5) 读取输出/输入输出参数。
    const outputValues = new Map<string, boolean | number>()
    for (const slot of target.params) {
      if (slot.direction !== 'output' && slot.direction !== 'inout') continue
      const area: 'INST' | 'L' = target.kind === 'FB' ? 'INST' : 'L'
      outputValues.set(slot.name, this.memory.read(this.slotRef(slot, area)))
    }

    // 6) 恢复调用者作用域并写回实参。
    this.scopeStack.pop()
    this.memory.setInstance(previousInstance.dbId, previousInstance.base)
    this.frameTop = base
    this.frameBase = previousFrameBase
    this.memory.frameBase = previousFrameBase

    for (const binding of call.bindings) {
      if (!binding.actual) continue
      if (binding.direction !== 'output' && binding.direction !== 'inout') continue
      const value = outputValues.get(binding.name)
      if (value === undefined) continue
      this.memory.write(binding.actual, value)
    }

    return true
  }

  private evalTimer(box: CompiledBox, enabled: boolean, scanTimeMs: number): boolean {
    const key = this.stateKey(box.id)
    const state = this.timers.get(key) ?? { et: 0, q: false, running: false }
    const input = this.readBoolParam(box, 'IN', enabled)
    const pt = Math.max(0, this.readNumberParam(box, 'PT', 0))

    if (box.handler === 'TON') {
      if (input) {
        state.et = Math.min(state.et + scanTimeMs, pt)
        state.q = state.et >= pt
      } else {
        state.et = 0
        state.q = false
      }
    } else if (box.handler === 'TOF') {
      if (input) {
        state.q = true
        state.et = 0
      } else if (state.q) {
        state.et = Math.min(state.et + scanTimeMs, pt)
        if (state.et >= pt) {
          state.q = false
          state.et = pt
        }
      }
    } else {
      // TP 脉冲
      if (input && !state.running) {
        state.running = true
        state.et = 0
        state.q = true
      }
      if (state.running) {
        state.et = Math.min(state.et + scanTimeMs, pt)
        if (state.et >= pt) {
          state.q = false
          state.running = false
          state.et = pt
        }
      } else {
        state.q = false
        state.et = 0
      }
    }

    this.timers.set(key, state)
    this.boxStates.set(key, { q: state.q, et: state.et })
    this.writeParam(box, 'Q', state.q)
    this.writeParam(box, 'ET', state.et)
    return state.q
  }

  private evalCounter(box: CompiledBox, enabled: boolean): boolean {
    const key = this.stateKey(box.id)
    const state = this.counters.get(key) ?? { cv: 0, prev: false, prevCd: false }
    const pv = Math.trunc(this.readNumberParam(box, 'PV', 0))
    const cu = this.readBoolParam(box, 'CU', enabled)
    const cd = this.readBoolParam(box, 'CD', false)
    const reset = this.readBoolParam(box, 'R', false)
    const load = this.readBoolParam(box, 'LD', false)

    if (box.handler === 'CTU') {
      if (reset) state.cv = 0
      else if (cu && !state.prev) state.cv += 1
      state.prev = cu
    } else if (box.handler === 'CTD') {
      if (load) state.cv = pv
      else if (cd && !state.prevCd) state.cv -= 1
      state.prevCd = cd
    } else {
      if (reset) state.cv = 0
      if (load) state.cv = pv
      if (cu && !state.prev) state.cv += 1
      if (cd && !state.prevCd) state.cv -= 1
      state.prev = cu
      state.prevCd = cd
    }

    const q = box.handler === 'CTD' ? state.cv <= 0 : state.cv >= pv
    this.counters.set(key, state)
    this.boxStates.set(key, { q, cv: state.cv })
    this.writeParam(box, 'CV', state.cv)
    this.writeParam(box, 'Q', q)
    return q
  }

  private evalCompare(box: CompiledBox): boolean {
    const left = this.readNumberParam(box, 'IN1', 0)
    const right = this.readNumberParam(box, 'IN2', 0)
    switch (box.operator) {
      case 'EQ':
        return left === right
      case 'NE':
        return left !== right
      case 'GT':
        return left > right
      case 'LT':
        return left < right
      case 'GE':
        return left >= right
      case 'LE':
        return left <= right
      default:
        return false
    }
  }

  private evalMath(box: CompiledBox): boolean {
    const left = this.readNumberParam(box, 'IN1', 0)
    const right = this.readNumberParam(box, 'IN2', 0)
    const single = this.readNumberParam(box, 'IN', 0)
    let result = 0
    switch (box.handler === 'ABS' ? 'ABS' : box.operator) {
      case 'ADD':
        result = left + right
        break
      case 'SUB':
        result = left - right
        break
      case 'MUL':
        result = left * right
        break
      case 'DIV':
        if (right === 0) {
          this.reportRuntime('除数为 0，结果按 0 处理。', box.id)
          result = 0
        } else {
          result = left / right
        }
        break
      case 'MOD':
        result = right === 0 ? 0 : left % right
        break
      case 'ABS':
        result = Math.abs(single)
        break
      case 'MIN':
        result = Math.min(left, right)
        break
      case 'MAX':
        result = Math.max(left, right)
        break
      default:
        result = left
    }
    this.writeParam(box, 'OUT', result)
    return true
  }

  private evalMove(box: CompiledBox): void {
    const operand = box.params.IN
    if (!operand) return
    const value = this.memory.read(operand)
    this.writeParam(box, 'OUT', value)
  }

  private evalConvert(box: CompiledBox): void {
    const operand = box.params.IN
    if (!operand) return
    const value = this.memory.read(operand)
    const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value
    const outRef = box.params.OUT
    let converted = numeric
    if (outRef && outRef.kind === 'mem' && outRef.type === 'REAL') converted = Math.fround(numeric)
    else if (box.handler === 'ROUND') converted = Math.round(numeric)
    else if (box.handler === 'TRUNC') converted = Math.trunc(numeric)
    this.writeParam(box, 'OUT', converted)
  }

  private evalBitwise(box: CompiledBox): void {
    const left = Math.trunc(this.readNumberParam(box, 'IN1', this.readNumberParam(box, 'IN', 0)))
    const right = Math.trunc(this.readNumberParam(box, 'IN2', this.readNumberParam(box, 'N', 0)))
    const mask = this.bitMaskFor(box.params.OUT ?? box.params.IN)
    let result = left
    switch (box.operator) {
      case 'AND':
        result = left & right
        break
      case 'OR':
        result = left | right
        break
      case 'XOR':
        result = left ^ right
        break
      case 'SHL':
        result = left << right
        break
      case 'SHR':
        result = left >>> right
        break
      default:
        result = left
    }
    this.writeParam(box, 'OUT', result & mask)
  }

  private bitMaskFor(operand: CompiledOperand | undefined): number {
    if (!operand || operand.kind !== 'mem') return 0xffffffff
    const ref: MemoryRef = operand
    switch (ref.type) {
      case 'BYTE':
        return 0xff
      case 'WORD':
        return 0xffff
      default:
        return 0xffffffff
    }
  }

  private reportRuntime(message: string, nodeId?: string): void {
    if (this.diagnostics.length > 50) return
    this.diagnostics.push({
      id: `rt_${this.diagnostics.length}_${nodeId ?? ''}`,
      severity: 'warning',
      message,
      nodeId,
    })
  }

  /** 顶层作用域（OB）下的指令运行状态，键为节点 id，供界面显示定时器/计数器实时值。 */
  topLevelBoxStates(): Record<string, BoxRuntimeState> {
    const result: Record<string, BoxRuntimeState> = {}
    for (const [key, value] of this.boxStates) {
      if (key.startsWith('#')) result[key.slice(1)] = value
    }
    return result
  }

  snapshot(): EngineSnapshot {
    return {
      scanCount: this.scanCount,
      simTimeMs: this.simTimeMs,
      trace: this.trace.slice(),
      diagnostics: this.diagnostics.slice(),
      states: this.topLevelBoxStates(),
    }
  }
}
