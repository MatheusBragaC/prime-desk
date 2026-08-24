import { useMemo, useState } from 'react'
import {
  Plus, Search, FolderOpen, RefreshCw, ChevronRight,
  FolderPlus, MoreHorizontal, Trash2, Pencil, GitBranch, Pin, Eye, EyeOff
} from 'lucide-react'
import { useAgent, newSession, refreshSessions, mutateFolders, openSession } from '../store/agent'
import { Butterfly } from './Butterfly'
import { shortPath } from '../lib/format'
import { groupSessions, withTitles, type Group } from '../lib/grouping'
import { SessionMenu } from './SessionMenu'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
import type { SessionSummary } from '../../../shared/protocol'

function SessionRow({
  s,
  active,
  busy,
  onOpen,
  groups
}: {
  s: SessionSummary
  active: boolean
  busy: boolean
  onOpen: () => void
  groups: Group[]
}) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const folders = useAgent((st) => st.folders)
  const pinned = Boolean(folders.pinned?.[s.id])
  const [draft, setDraft] = useState(s.title)

  async function commitRename() {
    const name = draft.trim()
    setRenaming(false)
    await mutateFolders((st) => {
      const titles = { ...(st.titles ?? {}) }
      if (!name) delete titles[s.id]
      else titles[s.id] = name
      return { ...st, titles }
    })
  }

  if (renaming) {
    return (
      <div className="mb-px px-3 py-[5px]">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
          className="w-full rounded border border-primary/45 bg-black/40 px-1.5 py-0.5 text-[12.6px] text-fg outline-none"
        />
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        disabled={busy}
        onClick={onOpen}
        className={
          'mb-[1px] flex w-full items-center gap-2 rounded-[8px] py-[6px] pl-2.5 pr-7 text-left transition-colors disabled:opacity-50 ' +
          (active
            ? 'bg-[var(--p-selected)] text-fg'
            : 'text-muted hover:bg-white/[0.04] hover:text-fg')
        }
        title={s.title}
      >
        {pinned ? (
          <Pin size={9} className="ml-[1px] mr-[3px] shrink-0 text-primarySoft" />
        ) : (
          <span
            className={
              'ml-[2px] mr-[3px] h-[5px] w-[5px] shrink-0 rounded-full border transition-colors ' +
              (active ? 'border-primarySoft' : 'border-grid group-hover:border-muted')
            }
          />
        )}
        <span className="min-w-0 flex-1 truncate text-[12.8px] leading-snug">{s.title}</span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          setMenu((v) => !v)
        }}
        className={
          'absolute right-1 top-1.5 rounded p-0.5 transition-opacity hover:text-fg ' +
          (menu ? 'text-fg opacity-100' : 'text-dim opacity-0 group-hover:opacity-100')
        }
        title="Ações"
      >
        <MoreHorizontal size={13} />
      </button>

      {menu && (
        <SessionMenu
          session={s}
          groups={groups}
          isActive={active}
          onClose={() => setMenu(false)}
          onOpen={() => {
            setMenu(false)
            onOpen()
          }}
          onRename={() => {
            setMenu(false)
            setDraft(s.title)
            setRenaming(true)
          }}
        />
      )}
    </div>
  )
}

function GroupHeader({
  group,
  collapsed,
  onToggle
}: {
  group: Group
  collapsed: boolean
  onToggle: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(group.label)

  async function commitRename() {
    const name = draft.trim()
    setRenaming(false)
    if (!name || !group.folderId || name === group.label) return
    await mutateFolders((s) => ({
      ...s,
      folders: s.folders.map((f) => (f.id === group.folderId ? { ...f, name } : f))
    }))
  }

  async function removeFolder() {
    if (!group.folderId) return
    await mutateFolders((s) => {
      const assignments = { ...s.assignments }
      for (const [sid, fid] of Object.entries(assignments)) {
        if (fid === group.folderId) delete assignments[sid]
      }
      return { ...s, folders: s.folders.filter((f) => f.id !== group.folderId), assignments }
    })
  }

  async function newHere() {
    // Sessão nova já nasce dentro da pasta clicada.
    await newSession()
    if (!group.folderId) return
    const sid = useAgent.getState().state?.sessionId
    if (!sid) return
    await mutateFolders((s) => ({
      ...s,
      assignments: { ...s.assignments, [sid]: group.folderId! }
    }))
  }

  return (
    <div className="group/h flex items-center gap-1 px-2 pb-1 pt-4">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 text-left">
        <ChevronRight
          size={10}
          className={
            'shrink-0 text-dim opacity-0 transition-all duration-200 group-hover/h:opacity-100 ' +
            (collapsed ? '' : 'rotate-90')
          }
        />
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            className="min-w-0 flex-1 rounded border border-primary/40 bg-black/40 px-1 text-[11.5px] text-fg outline-none"
          />
        ) : (
          <span className="truncate text-[11.5px] text-dim">{group.label}</span>
        )}
      </button>

      <button
        onClick={() => void newHere()}
        className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
        title="Nova conversa aqui"
      >
        <Plus size={12} />
      </button>

      {group.kind === 'folder' && (
        <>
          <button
            onClick={() => {
              setDraft(group.label)
              setRenaming(true)
            }}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
            title="Renomear"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={() => void removeFolder()}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover/h:opacity-100"
            title="Excluir pasta"
          >
            <Trash2 size={11} />
          </button>
        </>
      )}
    </div>
  )
}

export function Sidebar({
  home,
  onPickCwd,
  onToggleTree,
  treeOpen
}: {
  home: string
  onPickCwd: () => void
  onToggleTree: () => void
  treeOpen: boolean
}) {
  const sessions = useAgent((s) => s.sessions)
  const state = useAgent((s) => s.state)
  const cwd = useAgent((s) => s.cwd)
  const folders = useAgent((s) => s.folders)
  const tree = useAgent((s) => s.tree)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const size = useResizable('sidebar', 272, 200, 560, 'right')

  const archivedCount = useMemo(
    () => sessions.filter((s) => folders.archived?.[s.id]).length,
    [sessions, folders.archived]
  )

  const filtered = useMemo(() => {
    const named = withTitles(sessions, folders)
    const visible = showArchived
      ? named
      : named.filter((s) => !folders.archived?.[s.id])
    const q = query.trim().toLowerCase()
    if (!q) return visible
    return visible.filter(
      (s) => s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
    )
  }, [sessions, query, folders, showArchived])

  const groups = useMemo(
    () => groupSessions(filtered, folders, home).filter((g) => g.sessions.length > 0 || g.kind === 'folder'),
    [filtered, folders, home]
  )

  async function open(path: string) {
    setBusy(true)
    await openSession(path)
    setBusy(false)
  }

  /** A pasta só nasce com nome: evita ficar acumulando "Nova pasta" vazia. */
  async function createFolder(name: string) {
    const clean = name.trim()
    setCreating(false)
    if (!clean) return
    const id = 'f' + Date.now().toString(36)
    await mutateFolders((s) => ({
      ...s,
      folders: [...s.folders, { id, name: clean, order: s.folders.length }]
    }))
  }

  async function toggleGroup(key: string) {
    await mutateFolders((s) => ({
      ...s,
      collapsed: { ...s.collapsed, [key]: !s.collapsed[key] }
    }))
  }

  return (
    <aside
      style={{ width: size.width }}
      className="relative flex shrink-0 flex-col border-r border-white/[0.06] bg-[var(--p-surface)]"
    >
      <ResizeHandle
        side="right"
        dragging={size.dragging}
        onMouseDown={size.onMouseDown}
        onReset={size.reset}
      />
      <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 px-4">
        <Butterfly size={19} />
        <span className="flex-1 text-[13.5px] font-semibold tracking-tight">Prime Desk</span>
        <button
          onClick={onToggleTree}
          className={
            'no-drag relative rounded-md p-1 transition-colors ' +
            (treeOpen ? 'bg-primary/15 text-primarySoft' : 'text-dim hover:text-muted')
          }
          title="Árvore de agentes"
        >
          <GitBranch size={14} />
          {(tree?.subagents ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">
              {tree!.subagents}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-1.5 px-3 pb-2.5">
        <button
          onClick={() => void newSession()}
          className="no-drag flex flex-1 items-center gap-2 rounded-[10px] border border-primary/25 bg-primary/[0.11] px-3 py-2 text-[13px] font-medium text-fg transition-colors hover:border-primary/45 hover:bg-primary/[0.18]"
        >
          <Plus size={15} className="text-primarySoft" />
          Nova conversa
        </button>
        <button
          onClick={() => setCreating(true)}
          className="no-drag flex items-center justify-center rounded-[10px] border border-white/[0.08] px-2.5 text-dim transition-colors hover:border-primary/35 hover:text-primarySoft"
          title="Nova pasta"
        >
          <FolderPlus size={15} />
        </button>
      </div>

      <div className="px-3 pb-1">
        <div className="flex items-center gap-2 rounded-[9px] border border-white/[0.07] bg-black/25 px-2.5 py-1.5 focus-within:border-primary/40">
          <Search size={13} className="shrink-0 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sessões"
            className="w-full bg-transparent text-[12.5px] text-fg outline-none placeholder:text-dim"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-0.5 pt-2">
        <span className="text-[10.5px] uppercase tracking-wider text-dim">
          {filtered.length} conversas
        </span>
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-dim transition-colors hover:text-muted"
            title={showArchived ? 'Ocultar arquivadas' : `Mostrar ${archivedCount} arquivada(s)`}
          >
            {showArchived ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        <button
          onClick={() => void refreshSessions()}
          className="text-dim transition-colors hover:text-muted"
          title="Recarregar"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {creating && (
          <div className="px-2 pb-1 pt-2">
            <input
              autoFocus
              placeholder="Nome da pasta"
              onBlur={(e) => void createFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder(e.currentTarget.value)
                if (e.key === 'Escape') setCreating(false)
              }}
              className="w-full rounded border border-primary/45 bg-black/40 px-2 py-1 text-[12px] text-fg outline-none placeholder:text-dim"
            />
          </div>
        )}
        {groups.length === 0 && !creating && (
          <div className="px-2 py-6 text-center text-[12.5px] text-dim">Nenhuma sessão.</div>
        )}
        {groups.map((g) => {
          const collapsed = folders.collapsed[g.key] ?? false
          return (
            <div key={g.key}>
              <GroupHeader group={g} collapsed={collapsed} onToggle={() => void toggleGroup(g.key)} />
              {!collapsed &&
                g.sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    s={s}
                    active={state?.sessionId === s.id}
                    busy={busy}
                    onOpen={() => void open(s.path)}
                    groups={groups}
                  />
                ))}
            </div>
          )
        })}
      </div>

      <button
        onClick={onPickCwd}
        className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        title="Trocar diretório de trabalho (reinicia o agente)"
      >
        <FolderOpen size={13} className="shrink-0 text-dim" />
        <span className="truncate font-mono text-[11.5px] text-muted">
          {shortPath(cwd, home) || 'selecionar diretório'}
        </span>
      </button>
    </aside>
  )
}
