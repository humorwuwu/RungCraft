/** 把画布上某个节点滚动到视口中央（诊断跳转、键盘导航共用）。 */
export function revealNode(nodeId: string): void {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    const selector = `[data-node-id="${CSS.escape(nodeId)}"]`
    const element = document.querySelector(selector)
    element?.scrollIntoView({ block: 'center', inline: 'center' })
  })
}
