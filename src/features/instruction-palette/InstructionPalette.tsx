import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { paletteGroups, type InstructionDef } from '@/domain/catalog'
import { useUiStore } from '@/store/uiStore'

export function InstructionPalette() {
  const [query, setQuery] = useState('')
  const pendingInstructionId = useUiStore((state) => state.pendingInstructionId)
  const setPendingInstruction = useUiStore((state) => state.setPendingInstruction)

  const groups = useMemo(() => {
    const all = paletteGroups()
    if (!query.trim()) return all
    const lower = query.trim().toLowerCase()
    return all
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => item.label.toLowerCase().includes(lower) || item.id.toLowerCase().includes(lower) || item.description.toLowerCase().includes(lower),
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative shrink-0 border-b border-border p-1.5">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          className="field-input pl-6"
          placeholder="搜索指令…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {groups.map((group) => (
          <div key={group.category} className="mb-2">
            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{group.label}</div>
            <div className="grid grid-cols-2 gap-1">
              {group.items.map((item) => (
                <PaletteItem
                  key={item.id}
                  item={item}
                  active={pendingInstructionId === item.id}
                  onClick={() => setPendingInstruction(pendingInstructionId === item.id ? undefined : item.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <div className="p-3 text-center text-[12px] text-faint">没有匹配的指令</div>}
      </div>
      <div className="shrink-0 border-t border-border px-2 py-1 text-[11px] text-faint">
        点击指令后在画布中放置；也可直接拖到导线或元素上。
      </div>
    </div>
  )
}

function PaletteItem({ item, active, onClick }: { item: InstructionDef; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-ladder-instruction', item.id)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onClick}
      title={item.description}
      className={`flex h-12 flex-col items-start justify-center rounded border px-1.5 text-left text-[11px] leading-tight ${
        active ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-panel hover:bg-panel-alt'
      }`}
    >
      <span className="w-full truncate font-semibold">{item.label}</span>
      <span className="w-full truncate text-[10px] text-faint">{item.id}</span>
    </button>
  )
}
