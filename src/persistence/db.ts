import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Project } from '@/domain/types'
import { migrateProject } from './serialize'

const DB_NAME = 'ladder-editor'
const DB_VERSION = 1

interface SnapshotRecord {
  id: string
  projectId: string
  savedAt: string
  project: Project
}

interface LadderDB extends DBSchema {
  projects: {
    key: string
    value: Project
    indexes: { 'by-updated': string }
  }
  meta: {
    key: string
    value: string
  }
  snapshots: {
    key: string
    value: SnapshotRecord
    indexes: { 'by-project': string }
  }
}

let dbPromise: Promise<IDBPDatabase<LadderDB>> | undefined

function getDb(): Promise<IDBPDatabase<LadderDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LadderDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('meta')
        const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' })
        snapshots.createIndex('by-project', 'projectId')
      },
    })
  }
  return dbPromise
}

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function listProjects(): Promise<Project[]> {
  if (!indexedDbAvailable()) return []
  const db = await getDb()
  const projects = await db.getAll('projects')
  return projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export async function loadProject(id: string): Promise<Project | undefined> {
  if (!indexedDbAvailable()) return undefined
  const db = await getDb()
  const stored = await db.get('projects', id)
  // 旧版本工程缺少新字段（如 UDT 列表），读取时统一走一次迁移。
  return stored ? migrateProject(stored) : undefined
}

export async function saveProject(project: Project): Promise<void> {
  if (!indexedDbAvailable()) return
  const db = await getDb()
  await db.put('projects', project)
  await db.put('meta', project.id, 'lastProjectId')
}

export async function deleteProject(id: string): Promise<void> {
  if (!indexedDbAvailable()) return
  const db = await getDb()
  await db.delete('projects', id)
  const snapshots = await db.getAllKeysFromIndex('snapshots', 'by-project', id)
  for (const key of snapshots) await db.delete('snapshots', key)
}

export async function getLastProjectId(): Promise<string | undefined> {
  if (!indexedDbAvailable()) return undefined
  const db = await getDb()
  return db.get('meta', 'lastProjectId')
}

export async function setLastProjectId(id: string): Promise<void> {
  if (!indexedDbAvailable()) return
  const db = await getDb()
  await db.put('meta', id, 'lastProjectId')
}

/** 保留最近若干份恢复快照，避免误操作丢工程。 */
export async function saveRecoverySnapshot(project: Project, keep = 5): Promise<void> {
  if (!indexedDbAvailable()) return
  const db = await getDb()
  const id = `${project.id}:${Date.now()}`
  await db.put('snapshots', { id, projectId: project.id, savedAt: new Date().toISOString(), project })
  const keys = await db.getAllKeysFromIndex('snapshots', 'by-project', project.id)
  if (keys.length > keep) {
    const sorted = keys.slice().sort()
    const remove = sorted.slice(0, keys.length - keep)
    for (const key of remove) await db.delete('snapshots', key)
  }
}

export async function listRecoverySnapshots(projectId: string): Promise<SnapshotRecord[]> {
  if (!indexedDbAvailable()) return []
  const db = await getDb()
  const records = await db.getAllFromIndex('snapshots', 'by-project', projectId)
  return records.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}
