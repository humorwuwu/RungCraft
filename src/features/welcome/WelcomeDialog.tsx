import { FilePlus2, Sparkles } from 'lucide-react'
import { SAMPLES } from '@/domain/samples'
import type { Project } from '@/domain/types'
import { Button, Modal } from '@/components/ui'

/**
 * 启动引导：没有可恢复的工程时，让用户选择“新建空白工程”或从示例开始，
 * 而不是直接塞一个示例工程给他。
 */
export function WelcomeDialog({
  open,
  onCreateBlank,
  onLoadSample,
  onClose,
}: {
  open: boolean
  onCreateBlank: () => void
  onLoadSample: (project: Project, name: string) => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title="欢迎使用梯形图编辑器"
      width={560}
      onClose={onClose}
      footer={<Button onClick={onClose}>先看看当前工程</Button>}
    >
      <div data-testid="welcome" className="text-[12px]">
        <p className="mb-3 text-dim">
          纯浏览器运行的梯形图编程与仿真工具：编辑工程、编译下载、在线监视能流与变量，工程保存在本地浏览器中，无需后端。
        </p>
        <button
          type="button"
          className="mb-3 flex w-full items-center gap-2 rounded border border-border bg-panel-alt px-3 py-2 text-left hover:border-accent"
          onClick={onCreateBlank}
        >
          <FilePlus2 size={16} className="shrink-0 text-accent" />
          <span>
            <span className="block font-semibold">新建空白工程</span>
            <span className="block text-[11px] text-dim">从空的 OB1 主程序开始，自己搭建梯形图。</span>
          </span>
        </button>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-dim">
          <Sparkles size={12} />从示例开始
        </div>
        <div className="grid gap-1">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              data-testid={`welcome-sample-${sample.id}`}
              className="flex w-full flex-col rounded border border-border px-3 py-1.5 text-left hover:border-accent hover:bg-accent-soft"
              onClick={() => onLoadSample(sample.create(), sample.name)}
            >
              <span className="font-semibold">{sample.name}</span>
              <span className="text-[11px] text-dim">{sample.description}</span>
              <span className="text-[11px] text-faint">覆盖：{sample.highlights}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
