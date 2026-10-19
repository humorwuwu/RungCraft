import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import { create } from 'zustand'
import { createMotorSampleProject } from '@/domain/project'
import type { Project } from '@/domain/types'

enablePatches()

interface HistoryEntry {
  label: string
  patches: Patch[]
  inverse: Patch[]
  at: number
  coalesceKey?: string
}

export interface ProjectState {
  project: Project
  past: HistoryEntry[]
  future: HistoryEntry[]
  dirty: boolean
  lastSavedAt?: string
  /** 结构性修改计数，用于让仿真知道工程已变化。 */
  revision: number

  update: (recipe: (draft: Project) => void, label: string, options?: { coalesceKey?: string }) => void
  replaceProject: (project: Project, options?: { markClean?: boolean }) => void
  undo: () => void
  redo: () => void
  markSaved: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void
}

const HISTORY_LIMIT = 200
const COALESCE_WINDOW_MS = 600

export const useProjectStore = create<ProjectState>()((set, get) => ({
  project: createMotorSampleProject(),
  past: [],
  future: [],
  dirty: false,
  revision: 0,

  update: (recipe, label, options) => {
    const state = get()
    const [next, patches, inverse] = produceWithPatches(state.project, (draft) => {
      recipe(draft)
    })
    if (patches.length === 0) return
    const now = Date.now()
    const last = state.past[state.past.length - 1]
    const canCoalesce =
      Boolean(options?.coalesceKey) &&
      last?.coalesceKey === options?.coalesceKey &&
      now - last.at < COALESCE_WINDOW_MS

    let past: HistoryEntry[]
    if (canCoalesce && last) {
      const merged: HistoryEntry = {
        label,
        patches: [...last.patches, ...patches],
        inverse: [...inverse, ...last.inverse],
        at: now,
        coalesceKey: options?.coalesceKey,
      }
      past = [...state.past.slice(0, -1), merged]
    } else {
      past = [...state.past, { label, patches, inverse, at: now, coalesceKey: options?.coalesceKey }]
      if (past.length > HISTORY_LIMIT) past = past.slice(past.length - HISTORY_LIMIT)
    }

    set({
      project: next,
      past,
      future: [],
      dirty: true,
      revision: state.revision + 1,
    })
  },

  replaceProject: (project, options) => {
    set({
      project,
      past: [],
      future: [],
      dirty: !options?.markClean,
      revision: get().revision + 1,
    })
  },

  undo: () => {
    const state = get()
    const entry = state.past[state.past.length - 1]
    if (!entry) return
    set({
      project: applyPatches(state.project, entry.inverse),
      past: state.past.slice(0, -1),
      future: [entry, ...state.future],
      dirty: true,
      revision: state.revision + 1,
    })
  },

  redo: () => {
    const state = get()
    const entry = state.future[0]
    if (!entry) return
    set({
      project: applyPatches(state.project, entry.patches),
      past: [...state.past, entry],
      future: state.future.slice(1),
      dirty: true,
      revision: state.revision + 1,
    })
  },

  markSaved: () => set({ dirty: false, lastSavedAt: new Date().toISOString() }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  clearHistory: () => set({ past: [], future: [] }),
}))
