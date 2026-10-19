import { operandKey } from './operand'
import type { LadderNode, Operand, Project } from './types'
import { isCombinator } from './types'

export interface CrossReferenceUsage {
  blockId: string
  blockName: string
  networkId: string
  networkTitle: string
  nodeId: string
  nodeKind: LadderNode['kind']
  role: string
}

export interface CrossReferenceEntry {
  key: string
  operand: Operand
  usages: CrossReferenceUsage[]
}

/** 扫描整个工程，生成操作数 -> 使用位置的交叉引用。 */
export function buildCrossReferences(project: Project): CrossReferenceEntry[] {
  const map = new Map<string, CrossReferenceEntry>()

  const add = (operand: Operand | undefined, usage: CrossReferenceUsage) => {
    if (!operand) return
    const key = operandKey(operand)
    const entry = map.get(key) ?? { key, operand, usages: [] }
    entry.usages.push(usage)
    map.set(key, entry)
  }

  for (const block of project.blocks) {
    for (const network of block.networks) {
      const base = { blockId: block.id, blockName: block.name, networkId: network.id, networkTitle: network.title }
      walk(network.root, (node, role, operand) => {
        add(operand, { ...base, nodeId: node.id, nodeKind: node.kind, role })
      })
    }
  }

  return [...map.values()].sort((a, b) => b.usages.length - a.usages.length)
}

function walk(node: LadderNode, visit: (node: LadderNode, role: string, operand: Operand | undefined) => void): void {
  switch (node.kind) {
    case 'series':
    case 'parallel':
      for (const child of node.children) walk(child, visit)
      return
    case 'contact':
      visit(node, node.variant, node.operand)
      return
    case 'coil':
      visit(node, node.variant, node.operand)
      return
    case 'box':
      for (const [param, operand] of Object.entries(node.params)) visit(node, param, operand)
      return
    case 'call':
      for (const [param, operand] of Object.entries(node.bindings)) visit(node, param, operand)
      return
  }
}

/** 统计某个操作数在工程中的使用次数。 */
export function usageCount(project: Project, operand: Operand): number {
  const key = operandKey(operand)
  const entry = buildCrossReferences(project).find((item) => item.key === key)
  return entry?.usages.length ?? 0
}

export function isCombinatorNode(node: LadderNode): boolean {
  return isCombinator(node)
}
