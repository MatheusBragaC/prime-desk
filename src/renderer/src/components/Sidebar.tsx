import { useMemo, useState } from 'react'
import {
  Plus, Search, FolderOpen, MessageSquare, RefreshCw, ChevronRight, Folder,
  FolderPlus, MoreHorizontal, Trash2, Pencil, GitBranch
} from 'lucide-react'
import { useAgent, newSession, refreshSessions, rpc, mutateFolders } from '../store/agent'
import { Butterfly } from './Butterfly'
import { relTime, shortPath } from '../lib/format'
import { groupSessions, type Group } from '../lib/grouping'
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

  async function moveTo(folderId: string | null) {
    setMenu(false)
    await mutateFolders((state) => {
      const assignments = { ...state.assignments }
      if (folderId) assignments[s.id] = folderId
      else delete assignments[s.id]
      return { ...state, assignments }
    })
  }

  return (
    <div className="relative">
      <button
        disabled={busy}
        onClick={onOpen}
        className={
          'group mb-0.5 flex w-full items-start gap-2 rounded-[9px] py-1.5 pl-6 pr-7 text-left transition-colors disabled:opacity-50 ' +
          (active ? 'bg-[var(--p-selected)]' : 'hover:bg-white/[0.04]')
        }
      >
        <MessageSquare
          size={11}
          className={'mt-[4px] shrink-0 ' + (active ? 'text-primarySoft' : 'text-dim')}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-snug text-fg">{s.title}</span>
          <span className="mt-0.5 block text-[10.5px] text-dim">
            {relTime(s.updatedAt)}
            {s.messageCount > 0 && ` · ${s.messageCount} msgs`}
          </span>
        </span>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          setMenu((v) => !v)
        }}
        className="absolute right-1 top-2 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
        title="Mover para pasta"
      >
        <MoreHorizontal size={13} />
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
          <div className="absolute right-1 top-7 z-40 w-[190px] animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/60">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-dim">
              Mover para
            </div>
            {groups.filter((g) => g.kind === 'folder').length === 0 && (
              <div className="px-2 py-1.5 text-[11.5px] text-dim">Nenhuma pasta criada.</div>
            )}
            {groups
              .filter((g) => g.kind === 'folder')
              .map((g) => (
                <button
                  key={g.key}
                  onClick={() => void moveTo(g.folderId!)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
                >
                  <Folder size={11} />
                  <span className="truncate">{g.label}</span>
                </button>
              ))}
            <div className="my-1 border-t border-white/[0.07]" />
            <button
              onClick={() => void moveTo(null)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
            >
              <Trash2 size={11} />
              Remover da pasta
            </button>
          </div>
        </>
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
    <div className="group/h flex items-center gap-1 px-2 pb-0.5 pt-2.5">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 text-left">
        <ChevronRight
          size={11}
          className={'shrink-0 text-dim transition-transform duration-200 ' + (collapsed ? '' : 'rotate-90')}
        />
        {group.kind === 'folder' ? (
          <Folder size={11} className="shrink-0 text-primarySoft" />
        ) : null}
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
          <span className="truncate text-[11.5px] font-medium text-muted">{group.label}</span>
        )}
        <span className="shrink-0 text-[10px] text-dim">{group.sessions.length}</span>
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
    )
  }, [sessions, query])

  const groups = useMemo(
    () => groupSessions(filtered, folders, home).filter((g) => g.sessions.length > 0 || g.kind === 'folder'),
    [filtered, folders, home]
  )

  async function open(id: string) {
    setBusy(true)
    await rpc('switch_session', { sessionId: id })
    useAgent.getState().reset()
    const data = await rpc<{ messages: unknown[] }>('get_messages')
    if (data?.messages) {
      for (const msg of data.messages) {
        useAgent.getState().ingest({ type: 'message_end', message: msg } as never)
      }
    }
    setBusy(false)
  }

  async function createFolder() {
    const id = 'f' + Date.now().toString(36)
    await mutateFolders((s) => ({
      ...s,
      folders: [...s.folders, { id, name: 'Nova pasta', order: s.folders.length }]
    }))
  }

  async function toggleGroup(key: string) {
    await mutateFolders((s) => ({
      ...s,
      collapsed: { ...s.collapsed, [key]: !s.collapsed[key] }
    }))
  }

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-white/[0.06] bg-[var(--p-surface)]">
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
          onClick={() => void createFolder()}
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
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-dim">
          {filtered.length} sessões · {groups.length} grupos
        </span>
        <button
          onClick={() => void refreshSessions()}
          className="text-dim transition-colors hover:text-muted"
          title="Recarregar"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.length === 0 && (
          <div className="px-2 py-6 text-center text-[12.5px] text-dim">Nenhuma sessão.</div>
        )}
        {groups.map((g) => {
          const collapsed = folders.collapsed[g.key] ?? false
          return (
            <div key={g.key}>
              <GroupHeader group={g} collapsed={collapsed} onToggle={() => void toggleGroup(g.key)} />
              {!collapsed &&
                (g.sessions.length === 0 ? (
                  <div className="px-6 py-1.5 text-[11px] italic text-dim">
                    vazia — use o menu de uma conversa para mover
                  </div>
                ) : (
                  g.sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      s={s}
                      active={state?.sessionId === s.id}
                      busy={busy}
                      onOpen={() => void open(s.id)}
                      groups={groups}
                    />
                  ))
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
