import { useProjectStore } from '@/store/projectStore'
import { useSimulationStore } from '@/store/simulationStore'
import type { Project } from '@/domain/types'
import { simClient } from '@/workers/simClient'

/** 编译并下载当前工程到仿真器；工具栏按钮与快捷键共用。 */
export function compileAndDownload(project: Project): void {
  const revision = useProjectStore.getState().revision
  simClient.download(project, `build_${Date.now()}`)
  useSimulationStore.getState().setDownloadedRevision(revision)
}

/** 启动扫描；若工程尚未同步，先自动编译一次。 */
export function runSimulation(): void {
  const simulation = useSimulationStore.getState()
  const revision = useProjectStore.getState().revision
  const project = useProjectStore.getState().project
  if (simulation.downloadedRevision !== revision) compileAndDownload(project)
  simClient.run()
}

export function stopSimulation(): void {
  simClient.stop()
}
