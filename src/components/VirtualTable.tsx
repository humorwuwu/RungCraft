import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export interface VirtualTableColumn {
  key: string
  label: string
  /** CSS 网格列宽，如 '1fr'、'120px'。 */
  width: string
}

export interface VirtualTableProps<T> {
  columns: VirtualTableColumn[]
  items: T[]
  rowHeight?: number
  getKey: (item: T, index: number) => string
  /** 渲染一行的单元格（直接返回若干个 role="cell" 元素）。 */
  renderCells: (item: T, index: number) => ReactNode
  empty?: ReactNode
}

/**
 * 带窗口化的表格：只有视口内的行会渲染。
 * 变量表/监视表/实例监视在工程很大时行数可达数千，逐行常驻 DOM 会拖慢滚动与输入。
 */
export function VirtualTable<T>({ columns, items, rowHeight = 26, getKey, renderCells, empty }: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })
  const gridTemplateColumns = columns.map((column) => column.width).join(' ')

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
      <div role="table" className="w-full text-[12px]">
        <div
          role="row"
          className="sticky top-0 z-10 grid border-b border-border bg-panel-alt text-left text-dim"
          style={{ gridTemplateColumns }}
        >
          {columns.map((column) => (
            <div key={column.key} role="columnheader" className="px-2 py-1 font-medium">
              {column.label}
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index]
              return (
                <div
                  key={getKey(item, virtualRow.index)}
                  role="row"
                  className="absolute left-0 grid w-full items-center border-b border-border hover:bg-panel-alt"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: rowHeight,
                    gridTemplateColumns,
                  }}
                >
                  {renderCells(item, virtualRow.index)}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {items.length === 0 && empty}
    </div>
  )
}

/** 表格单元格。 */
export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="cell" className={`min-w-0 truncate px-2 ${className ?? ''}`}>
      {children}
    </div>
  )
}
