import { ChevronDown, ChevronRight, Database, FileCode2, Layers, Plus, Shapes, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { createDataBlock, createProgramBlock, createUdt, nextBlockNumber, nextDbNumber, nextUdtName } from '@/domain/project'
import type { Project } from '@/domain/types'
import { addDataBlock, addNetwork, addProgramBlock, addUserType, countBlockCalls, deleteNetwork, deleteProgramBlock } from '@/store/editorActions'
import { confirmAction, notify } from '@/store/notificationStore'
import { useUiStore } from '@/store/uiStore'

export function ProjectTree({ project }: { project: Project }) {
  const activeBlockId = useUiStore((state) => state.activeBlockId)
  const activeNetworkId = useUiStore((state) => state.activeNetworkId)
  const centerView = useUiStore((state) => state.centerView)
  const activeDbId = useUiStore((state) => state.activeDbId)
  const setActiveBlock = useUiStore((state) => state.setActiveBlock)
  const setActiveNetwork = useUiStore((state) => state.setActiveNetwork)
  const setActiveDb = useUiStore((state) => state.setActiveDb)
  const setActiveUdt = useUiStore((state) => state.setActiveUdt)
  const setCenterView = useUiStore((state) => state.setCenterView)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ blocks: true, tags: true, dbs: false })

  const toggle = (key: string) => setExpanded((value) => ({ ...value, [key]: !value[key] }))

  const handleDeleteBlock = async (id: string, name: string, kind: string) => {
    if (kind === 'OB' && project.blocks.filter((item) => item.kind === 'OB').length <= 1) {
      notify('至少要保留一个主程序块 OB。', 'warning')
      return
    }
    const calls = countBlockCalls(project, id)
    const instanceDbs = project.dataBlocks.filter((db) => db.instanceOf === id).length
    const extras = [calls > 0 ? `仍有 ${calls} 处调用（会变成“块不存在”错误）` : '', instanceDbs > 0 ? `它的 ${instanceDbs} 个实例数据块会一并删除` : '']
      .filter(Boolean)
      .join('；')
    const ok = await confirmAction(`确定删除块「${name}」吗？${extras ? `${extras}。` : ''}`, {
      title: '删除程序块',
      confirmLabel: '删除',
      danger: true,
    })
    if (!ok) return
    deleteProgramBlock(id)
    notify(`已删除块「${name}」。`, 'success')
  }

  const blockId = activeBlockId ?? project.blocks[0]?.id

  return (
    <div className="p-1 text-[12px]">
      <div className="mb-1 flex items-center gap-1 px-1 py-0.5 font-semibold text-dim">
        <Layers size={13} />
        <span className="truncate">{project.name}</span>
      </div>

      <TreeGroup
        icon={<Table2 size={13} />}
        label={`PLC 变量 (${project.tagTables.reduce((sum, table) => sum + table.tags.length, 0)})`}
        open={expanded.tags}
        onToggle={() => toggle('tags')}
        onDoubleClick={() => setCenterView('tags')}
      >
        {project.tagTables.map((table) => (
          <TreeLeaf key={table.id} label={table.name} depth={2} onClick={() => setCenterView('tags')} />
        ))}
      </TreeGroup>

      <TreeGroup
        icon={<FileCode2 size={13} />}
        label="程序块"
        open={expanded.blocks}
        onToggle={() => toggle('blocks')}
        actions={
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              title="新增 FC"
              className="rounded px-1 text-[10px] hover:bg-panel-sunken"
              onClick={() => {
                const number = nextBlockNumber(project)
                const block = createProgramBlock('FC', `FC${number}`, number)
                addProgramBlock(block)
                setActiveBlock(block.id, block.networks[0].id)
              }}
            >
              +FC
            </button>
            <button
              type="button"
              title="新增 FB"
              className="rounded px-1 text-[10px] hover:bg-panel-sunken"
              onClick={() => {
                const number = nextBlockNumber(project)
                const block = createProgramBlock('FB', `FB${number}`, number)
                addProgramBlock(block)
                setActiveBlock(block.id, block.networks[0].id)
              }}
            >
              +FB
            </button>
            <button
              type="button"
              title="新增网络"
              className="rounded p-0.5 hover:bg-panel-sunken"
              onClick={() => blockId && addNetwork(blockId)}
            >
              <Plus size={12} />
            </button>
          </span>
        }
      >
        {project.blocks.map((item) => (
          <div key={item.id}>
            <div className="group flex items-center">
              <div className="min-w-0 flex-1">
                <TreeLeaf
                  label={`${item.name} (${item.kind}${item.number})`}
                  depth={2}
                  active={item.id === blockId && centerView === 'ladder'}
                  onClick={() => setActiveBlock(item.id, item.networks[0]?.id)}
                />
              </div>
              <button
                type="button"
                title="删除程序块"
                data-testid="delete-block"
                className="mr-1 hidden rounded p-0.5 text-faint hover:bg-panel-sunken hover:text-error group-hover:block"
                onClick={() => void handleDeleteBlock(item.id, item.name, item.kind)}
              >
                ✕
              </button>
            </div>
            {item.id === blockId &&
              item.networks.map((network, index) => (
                <div key={network.id} className="group flex items-center">
                  <TreeLeaf
                    label={`网络 ${index + 1}${network.title ? ` · ${network.title}` : ''}`}
                    depth={3}
                    active={network.id === activeNetworkId && centerView === 'ladder'}
                    onClick={() => {
                      setActiveNetwork(network.id)
                      setCenterView('ladder')
                    }}
                  />
                  {item.networks.length > 1 && (
                    <button
                      type="button"
                      title="删除网络"
                      className="mr-1 hidden rounded p-0.5 text-faint hover:bg-panel-sunken group-hover:block"
                      onClick={() => deleteNetwork(item.id, network.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
          </div>
        ))}
      </TreeGroup>

      <TreeGroup
        icon={<Database size={13} />}
        label={`数据块 (${project.dataBlocks.length})`}
        open={expanded.dbs}
        onToggle={() => toggle('dbs')}
        actions={
          <button
            type="button"
            title="新增数据块"
            className="rounded p-0.5 hover:bg-panel-sunken"
            onClick={() => {
              const number = nextDbNumber(project)
              const db = createDataBlock(`DataBlock_${number}`, number)
              addDataBlock(db)
              setActiveDb(db.id)
            }}
          >
            <Plus size={12} />
          </button>
        }
      >
        {project.dataBlocks.map((db) => (
          <TreeLeaf
            key={db.id}
            label={`${db.name} (DB${db.number})`}
            depth={2}
            active={activeDbId === db.id && centerView === 'dbs'}
            onClick={() => setActiveDb(db.id)}
          />
        ))}
      </TreeGroup>

      <TreeGroup
        icon={<Shapes size={13} />}
        label={`PLC 数据类型 (${project.userTypes.length})`}
        open={expanded.udts !== false}
        onToggle={() => toggle('udts')}
        actions={
          <button
            type="button"
            title="新建 PLC 数据类型"
            className="rounded p-0.5 hover:bg-panel-sunken"
            onClick={() => {
              const udt = createUdt(nextUdtName(project))
              addUserType(udt)
              setActiveUdt(udt.id)
            }}
          >
            <Plus size={12} />
          </button>
        }
      >
        {project.userTypes.map((udt) => (
          <TreeLeaf key={udt.id} label={udt.name} depth={2} onClick={() => setActiveUdt(udt.id)} />
        ))}
      </TreeGroup>

      <TreeGroup
        icon={<Table2 size={13} />}
        label="监视表"
        open={expanded.watch !== false}
        onToggle={() => toggle('watch')}
      >
        {project.watchTables.map((table) => (
          <TreeLeaf key={table.id} label={table.name} depth={2} onClick={() => setCenterView('watch')} />
        ))}
      </TreeGroup>
    </div>
  )
}

function TreeGroup({
  icon,
  label,
  open,
  onToggle,
  children,
  actions,
  onDoubleClick,
}: {
  icon: ReactNode
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  actions?: ReactNode
  onDoubleClick?: () => void
}) {
  return (
    <div>
      <div className="group flex items-center rounded px-1 py-0.5 hover:bg-panel-sunken" onDoubleClick={onDoubleClick}>
        <button type="button" className="mr-0.5 text-dim" onClick={onToggle}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="mr-1 text-dim">{icon}</span>
        <span className="flex-1 truncate font-semibold">{label}</span>
        {actions}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

function TreeLeaf({
  label,
  depth,
  active,
  onClick,
}: {
  label: string
  depth: number
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: depth * 14 + 6 }}
      className={`flex w-full items-center rounded py-0.5 pr-1 text-left ${
        active ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-panel-sunken'
      }`}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
