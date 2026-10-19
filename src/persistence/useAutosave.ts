import { useEffect } from 'react'
import { notify } from '@/store/notificationStore'
import { useProjectStore } from '@/store/projectStore'
import { saveProject, saveRecoverySnapshot, setLastProjectId } from './db'

/** 工程变更后防抖自动保存到 IndexedDB，并保留恢复快照。 */
export function useAutosave(): void {
  const project = useProjectStore((state) => state.project)
  const dirty = useProjectStore((state) => state.dirty)
  const markSaved = useProjectStore((state) => state.markSaved)

  useEffect(() => {
    if (!dirty) return
    const handle = setTimeout(() => {
      void (async () => {
        try {
          await saveProject(project)
          await saveRecoverySnapshot(project)
          await setLastProjectId(project.id)
          markSaved()
        } catch (error) {
          console.error('自动保存失败', error)
          notify(`自动保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        }
      })()
    }, 800)
    return () => clearTimeout(handle)
  }, [project, dirty, markSaved])
}
