import { useMemo, useState } from 'react'
import {
  Plus, Search, FolderOpen, RefreshCw, ChevronRight, SquarePen,
  FolderPlus, MoreHorizontal, Trash2, Pencil, Pin, Eye, EyeOff
} from 'lucide-react'
import { useAgent, newSession, refreshSessions, mutateFolders, openSession } from '../store/agent'
import { Butterfly } from './Butterfly'
import { shortPath } from '../lib/format'
import { groupSessions, withTitles, type Group } from '../lib/grouping'
import { SessionMenu } from './SessionMenu'
import { AccountBadge } from './AccountBadge'
import { useIsMac, MAC_TRAFFIC_LIGHTS_WIDTH } from '../lib/platform'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
import type { SessionSummary } from '../../../shared/protocol'
import { useT } from '../i18n'

function SessionRow({
  s,
  active,
  busy,
  inUse,
  running,
  onOpen,
  groups
}: {
  s: SessionSummary
  active: boolean
  busy: boolean
  inUse: boolean
  /** Turno desta conversa seguindo numa ponte estacionada. */
  running: boolean
  onOpen: () => void
  groups: Group[]
}) {
  const { t } = useT()
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
          className="w-full rounded border border-primary/45 bg-black/40 px-1.5 py-0.5 text-sm text-fg outline-none"
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
          'mb-[1px] flex h-8 w-full items-center gap-2 rounded-sm pl-2.5 pr-7 text-left transition-colors disabled:opacity-50 ' +
          (active ? 'bg-[var(--p-selected)] text-fg' : 'text-muted hover:bg-elevated hover:text-fg')
        }
        title={s.title}
      >
        {/*
          A linha ativa é marcada pelo fundo, como no Claude Desktop — o ponto de
          status só aparece quando carrega informação que o fundo não dá: fixada,
          ou carregada por outro worker do daemon.
        */}
        {running ? (
          <span
            title={t('session.runningElsewhere')}
            className="h-[6px] w-[6px] shrink-0 animate-pulse-soft rounded-full bg-primary"
          />
        ) : pinned ? (
          <Pin size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
        ) : inUse ? (
          <span
            title={t('session.inUse')}
            className="h-[5px] w-[5px] shrink-0 rounded-full border border-warn bg-warn/40"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm leading-snug">{s.title}</span>
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
        title={t('menu.actions')}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
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
  const { t } = useT()
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
          size={14} strokeWidth={1.75}
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
            className="min-w-0 flex-1 rounded border border-primary/40 bg-black/40 px-1 text-xs text-fg outline-none"
          />
        ) : (
          <span className="truncate text-xs text-dim">{group.label}</span>
        )}
      </button>

      <button
        onClick={() => void newHere()}
        className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
        title={t('sidebar.newChat')}
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>

      {group.kind === 'folder' && (
        <>
          <button
            onClick={() => {
              setDraft(group.label)
              setRenaming(true)
            }}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
            title={t('menu.rename')}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => void removeFolder()}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover/h:opacity-100"
            title={t('menu.delete')}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </>
      )}
    </div>
  )
}

export function Sidebar({
  home,
  onPickCwd,
  onSignedOut,
  onNavigate
}: {
  home: string
  onPickCwd: () => void
  onSignedOut: () => void
  /** Chamado ao abrir uma conversa, para fechar a sobreposição em tela estreita. */
  onNavigate?: () => void
}) {
  const sessions = useAgent((s) => s.sessions)
  const state = useAgent((s) => s.state)
  const cwd = useAgent((s) => s.cwd)
  const folders = useAgent((s) => s.folders)
  const tree = useAgent((s) => s.tree)
  const parkedRuns = useAgent((s) => s.parkedRuns)
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const size = useResizable('sidebar', 272, 200, 560, 'right')
  const isMac = useIsMac()

  const archivedCount = useMemo(
    () => sessions.filter((s) => folders.archived?.[s.id]).length,
    [sessions, folders.archived]
  )

  /**
   * Sessões carregadas por outro worker do daemon. A própria sessão da ponte
   * fica de fora: clicar nela é inofensivo.
   */
  const inUseIds = useMemo(() => {
    const ids = new Set<string>()
    const walk = (nodes: typeof tree extends null ? never : NonNullable<typeof tree>['roots']) => {
      for (const n of nodes) {
        if (n.sessionId && n.sessionId !== state?.sessionId) ids.add(n.sessionId)
        if (n.children.length) walk(n.children)
      }
    }
    if (tree) walk(tree.roots)
    return ids
  }, [tree, state?.sessionId])

  /** Conversas cujo turno continua rodando fora da tela. */
  const runningPaths = useMemo(
    () => new Set(parkedRuns.filter((r) => r.running).map((r) => r.sessionPath)),
    [parkedRuns]
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
    onNavigate?.()
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
      className="relative flex shrink-0 flex-col bg-[var(--p-surface)]"
    >
      <ResizeHandle
        side="right"
        dragging={size.dragging}
        onMouseDown={size.onMouseDown}
        onReset={size.reset}
      />
      {/* No macOS os semáforos ficam aqui: o cabeçalho recua para não ficar sob eles. */}
      <div
        className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 pr-4"
        style={{ paddingLeft: isMac ? MAC_TRAFFIC_LIGHTS_WIDTH : 16 }}
      >
        <Butterfly size={19} />
        {/* A árvore de agentes migrou para a barra de ferramentas do topo. */}
        <span className="flex-1 text-sm font-semibold tracking-tight">Prime Desk</span>
      </div>

      {/*
        "Nova conversa" como linha de menu, não como botão preenchido: no Claude
        Desktop nada na sidebar compete com o conteúdo. As ações secundárias
        (nova pasta, recarregar, arquivadas) só aparecem no hover do bloco.
      */}
      <div className="group/act px-2 pb-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void newSession()}
            className="no-drag flex flex-1 items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
          >
            <SquarePen size={16} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
            {t('sidebar.newChat')}
          </button>

          <button
            onClick={() => setCreating(true)}
            className="no-drag shrink-0 rounded-sm p-1.5 text-dim opacity-0 transition-all hover:bg-elevated hover:text-muted group-hover/act:opacity-100"
            title={t('sidebar.newFolder')}
          >
            <FolderPlus size={16} strokeWidth={1.75} />
          </button>
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={
                'no-drag shrink-0 rounded-sm p-1.5 transition-all hover:bg-elevated hover:text-muted ' +
                (showArchived ? 'text-muted opacity-100' : 'text-dim opacity-0 group-hover/act:opacity-100')
              }
              title={showArchived ? t('sidebar.hideArchived') : t('sidebar.showArchived')}
            >
              {showArchived ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
            </button>
          )}
          <button
            onClick={() => void refreshSessions()}
            className="no-drag shrink-0 rounded-sm p-1.5 text-dim opacity-0 transition-all hover:bg-elevated hover:text-muted group-hover/act:opacity-100"
            title={t('sidebar.reload')}
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="px-2 pb-1">
        <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors focus-within:bg-elevated hover:bg-elevated">
          <Search size={16} strokeWidth={1.75} className="shrink-0 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sidebar.search')}
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-dim"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {creating && (
          <div className="px-2 pb-1 pt-2">
            <input
              autoFocus
              placeholder={t('sidebar.folderName')}
              onBlur={(e) => void createFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder(e.currentTarget.value)
                if (e.key === 'Escape') setCreating(false)
              }}
              className="w-full rounded border border-primary/45 bg-black/40 px-2 py-1 text-sm text-fg outline-none placeholder:text-dim"
            />
          </div>
        )}
        {groups.length === 0 && !creating && (
          <div className="px-2 py-6 text-center text-sm text-dim">{t('sidebar.empty')}</div>
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
                    inUse={inUseIds.has(s.id)}
                    running={runningPaths.has(s.path)}
                    onOpen={() => void open(s.path)}
                    groups={groups}
                  />
                ))}
            </div>
          )
        })}
      </div>

      <AccountBadge onSignedOut={onSignedOut} />

      <button
        onClick={onPickCwd}
        className="flex items-center gap-2 border-t border-[var(--p-line)] px-4 py-2 text-left transition-colors hover:bg-elevated"
        title={t('sidebar.pickCwd')}
      >
        <FolderOpen size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
        <span className="truncate font-mono text-xs text-muted">
          {shortPath(cwd, home) || t('sidebar.pickCwdEmpty')}
        </span>
      </button>
    </aside>
  )
}
