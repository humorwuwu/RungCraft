import type { Project } from '@/domain/types'
import { SCHEMA_VERSION } from '@/domain/project'
import { projectEnvelopeSchema, projectSchema } from './schema'

export const APP_VERSION = '0.1.0'
export const PROTOCOL_VERSION = 1

export interface ExportEnvelope {
  fileType: 'lad-project'
  schemaVersion: number
  protocolCompatible: number
  appVersion: string
  exportedAt: string
  project: Project
}

export function exportProjectFile(project: Project): string {
  const envelope: ExportEnvelope = {
    fileType: 'lad-project',
    schemaVersion: SCHEMA_VERSION,
    protocolCompatible: PROTOCOL_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  }
  return JSON.stringify(envelope, null, 2)
}

export type ParseResult =
  | { ok: true; project: Project }
  | { ok: false; errors: string[] }

/** 解析并校验工程文件；拒绝未来版本和畸形内容。 */
export function parseProjectFile(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['文件不是合法的 JSON。'] }
  }

  const envelopeResult = projectEnvelopeSchema.safeParse(raw)
  if (!envelopeResult.success) {
    // 也允许直接导入裸工程对象，方便手工编辑与旧文件。
    const projectResult = projectSchema.safeParse(raw)
    if (projectResult.success) {
      return finishImport(projectResult.data as unknown as Project)
    }
    return { ok: false, errors: formatIssues(envelopeResult.error) }
  }

  const envelope = envelopeResult.data
  if (envelope.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`工程版本 ${envelope.schemaVersion} 高于当前支持的 ${SCHEMA_VERSION}，请升级应用后再导入。`],
    }
  }
  return finishImport(envelope.project as unknown as Project)
}

function finishImport(project: Project): ParseResult {
  const migrated = migrateProject(project)
  const result = projectSchema.safeParse(migrated)
  if (!result.success) {
    return { ok: false, errors: formatIssues(result.error) }
  }
  return { ok: true, project: result.data as unknown as Project }
}

/** 顺序迁移入口：v1 -> v2（新增 PLC 数据类型列表）。 */
export function migrateProject(project: Project): Project {
  let next = project
  const version = next.schemaVersion ?? 1
  if (version < 2) {
    next = { ...next, userTypes: next.userTypes ?? [] }
  }
  // 未来版本迁移在这里逐级追加：v2 -> v3 -> ...
  return { ...next, schemaVersion: SCHEMA_VERSION }
}

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '根对象'
    return `${path}: ${issue.message}`
  })
}

/** 深拷贝，避免 store 与持久化对象共享引用。 */
export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project
}
