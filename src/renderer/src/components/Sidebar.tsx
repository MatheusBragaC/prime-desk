import { useMemo, useRef, useState } from 'react'
import {
  Plus, Search, RefreshCw, ChevronRight, SquarePen,
  FolderPlus, MoreHorizontal, Trash2, Pencil, Pin, Eye, EyeOff, WandSparkles
} from 'lucide-react'
import {
  useAgent, newSession, refreshSessions, mutateFolders, openSession, generateTitlesFor
} from '../store/agent'
import { Butterfly } from './Butterfly'
import { groupSessions, withTitles, type Group } from '../lib/grouping'
import { SessionMenu } from './SessionMenu'
import { AccountBadge } from './AccountBadge'
import { useIsMac, MAC_TRAFFIC_LIGHTS_WIDTH } from '../lib/platform'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
import type { SessionSummary } from '../../../shared/protocol'
import { useT } from '../i18n'

/**
 * Conversas mostradas por grupo antes do "mostrar mais".
 *
 * Um grupo de projeto ativo passa fácil de vinte conversas, e a lista inteira
 * virava uma parede onde os outros projetos ficavam abaixo da dobra. Doze
 * linhas de 33px dão ~400px — perto de uma tela de lista na altura típica da
 * janela, então cada projeto ocupa no máximo uma "página" antes de pedir mais.
 *
 * Busca ignora o limite: esconder resultado atrás de um botão seria hostil.
 */
const PER_GROUP = 12

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
  const menuBtn = useRef<HTMLButtonElement>(null)
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
          'mb-px flex h-8 w-full items-center gap-2 rounded-md pl-2 pr-2 text-left transition-colors disabled:opacity-50 ' +
          (active
            ? 'bg-[var(--p-selected)] text-fg'
            : 'text-fg/80 hover:bg-elevated hover:text-fg')
        }
        title={s.title}
      >
        {/*
          Trilho de marcador com largura fixa, em toda linha.

          Antes o marcador só existia quando havia status (fixada, rodando,
          carregada por outro worker), e a linha sem status não tinha nada: o
          início do texto pulava alguns pixels conforme o estado, e a lista lia
          como um bloco de texto solto, sem eixo. Agora o slot é sempre o mesmo
          e o que muda é o glifo dentro dele — é assim que a sidebar do Claude
          se mantém alinhada.

          O ponto vazado é o estado normal. Ele não informa nada: existe para
          dar coluna à lista e para o status ter onde aparecer sem empurrar
          ninguém.
        */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {running ? (
            <span
              title={t('session.runningElsewhere')}
              className="h-[6px] w-[6px] animate-pulse-soft rounded-full bg-primary"
            />
          ) : pinned ? (
            <Pin size={13} strokeWidth={1.75} className="text-primarySoft" />
          ) : inUse ? (
            <span
              title={t('session.inUse')}
              className="h-[5px] w-[5px] rounded-full border border-warn bg-warn/40"
            />
          ) : (
            <span
              className={
                'h-[5px] w-[5px] rounded-full border transition-colors ' +
                (active ? 'border-primarySoft bg-primarySoft/40' : 'border-grid')
              }
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm leading-snug">{s.title}</span>
      </button>

      {/*
        O botão de ações flutua sobre o fim do texto em vez de ter coluna
        própria. Antes a linha reservava 28px de `padding-right` para ele o
        tempo todo, e o título cortava quatro caracteres antes do necessário em
        TODA conversa — para um botão que só aparece no hover. O esmaecimento
        abaixo evita que o texto passe por baixo do ícone.
      */}
      <span
        className={
          'pointer-events-none absolute right-0 top-0 h-8 w-11 rounded-r-md bg-gradient-to-l to-transparent transition-opacity ' +
          (active ? 'from-[var(--p-selected)] via-[var(--p-selected)]' : 'from-elevated via-elevated') +
          (menu ? ' opacity-100' : ' opacity-0 group-hover:opacity-100')
        }
      />

      <button
        ref={menuBtn}
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
          trigger={menuBtn}
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
    /*
      `pt-5 pb-1.5` em vez de `pt-4 pb-1`: o cabeçalho ficava à mesma distância
      do próprio grupo e do grupo anterior, então a lista lia como uma coluna
      única de texto. Com o respiro assimétrico, cada projeto vira um bloco.
    */
    <div className="group/h flex items-center gap-1 px-2 pb-1.5 pt-5">
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
          <>
            <span className="truncate text-xs font-medium tracking-wide text-muted">
              {group.label}
            </span>
            {/*
              Contagem discreta. Vale porque o grupo pode estar recolhido, e
              porque com dez projetos abertos saber onde está o volume de
              conversa é mais rápido de ler que contar linha.
            */}
            <span className="shrink-0 font-mono text-micro text-dim">
              {group.sessions.length}
            </span>
          </>
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
  onSignedOut,
  onNavigate
}: {
  home: string
  onSignedOut: () => void
  /** Chamado ao abrir uma conversa, para fechar a sobreposição em tela estreita. */
  onNavigate?: () => void
}) {
  const sessions = useAgent((s) => s.sessions)
  const state = useAgent((s) => s.state)
  const folders = useAgent((s) => s.folders)
  const tree = useAgent((s) => s.tree)
  const parkedRuns = useAgent((s) => s.parkedRuns)
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  /*
    Grupos expandidos além do limite. Não é persistido de propósito: é escolha
    de momento, e guardar traria mais um estado para sincronizar com pastas que
    podem deixar de existir.
  */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  /** `null` fora do lote; `{done,total}` durante. */
  const [titling, setTitling] = useState<{ done: number; total: number } | null>(null)
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

  /**
   * Conversas sem nome: nem gravado no arquivo, nem renomeado à mão.
   *
   * O que a lista mostra nesses casos é a primeira frase do prompt, limpa —
   * legível, mas é o texto de quem digitou, não um nome. Conversa nascida no
   * terminal cai sempre aqui, porque `maybeGenerateTitle` só dispara no fim do
   * primeiro turno criado dentro do app.
   */
  const untitled = useMemo(
    () => sessions.filter((s) => !s.named && !folders.titles?.[s.id]),
    [sessions, folders.titles]
  )

  function titleAll(): void {
    const alvo = untitled
    if (alvo.length === 0) return
    useAgent.getState().requestConfirm({
      title: t('sidebar.titleAllTitle'),
      message: t('sidebar.titleAllMsg', { n: alvo.length }),
      detail: t('sidebar.titleAllWarn'),
      confirmLabel: t('sidebar.titleAllConfirm'),
      /*
        Sem `await` aqui de propósito. O ConfirmDialog espera o `onConfirm` e
        fica em estado ocupado até resolver — certo para confirmação curta,
        errado para um lote de vinte conversas: o diálogo ficava travado em
        "processando" por minutos, com o véu bloqueando a janela inteira,
        enquanto o progresso já corria na sidebar atrás dele. Aqui o diálogo
        fecha na hora e quem acompanha é a linha de progresso.
      */
      onConfirm: () => {
        setTitling({ done: 0, total: alvo.length })
        void generateTitlesFor(alvo, (done, total) => setTitling({ done, total }))
          .catch(() => undefined)
          .finally(() => setTitling(null))
      }
    })
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
          {/*
            Só aparece quando há conversa sem nome — e some quando não há mais.
            Um botão permanente que não faz nada na maioria dos cliques seria
            pior que a ausência dele.
          */}
          {(untitled.length > 0 || titling) && (
            <button
              onClick={titleAll}
              disabled={Boolean(titling)}
              className={
                'no-drag shrink-0 rounded-sm p-1.5 transition-all hover:bg-elevated hover:text-muted ' +
                (titling
                  ? 'text-primary opacity-100'
                  : 'text-dim opacity-0 group-hover/act:opacity-100')
              }
              title={
                titling
                  ? t('sidebar.titlingProgress', { done: titling.done, total: titling.total })
                  : t('sidebar.titleAll', { n: untitled.length })
              }
            >
              <WandSparkles
                size={16} strokeWidth={1.75}
                className={titling ? 'animate-pulse-soft' : ''}
              />
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

      {/*
        Progresso do lote, visível sem hover: são alguns segundos por conversa,
        e num lote de vinte isso passa de dois minutos. Um spinner escondido em
        `title` de botão não serve para acompanhar.
      */}
      {titling && (
        <div className="mx-2 mb-1 flex items-center gap-2 rounded-sm bg-primary/[0.07] px-2 py-1.5 animate-fade-up">
          <WandSparkles
            size={13} strokeWidth={1.75}
            className="shrink-0 animate-pulse-soft text-primarySoft"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {t('sidebar.titlingProgress', { done: titling.done, total: titling.total })}
          </span>
          <span className="shrink-0 font-mono text-micro text-dim">
            {Math.round((titling.done / titling.total) * 100)}%
          </span>
        </div>
      )}

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
          const searching = query.trim().length > 0
          const showAll = searching || expanded.has(g.key)
          const shown = showAll ? g.sessions : g.sessions.slice(0, PER_GROUP)
          const hidden = g.sessions.length - shown.length

          return (
            <div key={g.key}>
              <GroupHeader group={g} collapsed={collapsed} onToggle={() => void toggleGroup(g.key)} />
              {!collapsed && (
                <>
                  {shown.map((s) => (
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

                  {(hidden > 0 || (showAll && !searching && g.sessions.length > PER_GROUP)) && (
                    <button
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev)
                          if (next.has(g.key)) next.delete(g.key)
                          else next.add(g.key)
                          return next
                        })
                      }
                      /* Alinhado com o texto das linhas, não com o trilho: é
                         ação da lista, não item dela. */
                      className="mb-px flex h-7 w-full items-center rounded-md pl-8 pr-2 text-left text-xs text-dim transition-colors hover:bg-elevated hover:text-muted"
                    >
                      {hidden > 0 ? t('sidebar.showMore', { n: hidden }) : t('sidebar.showLess')}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      <AccountBadge onSignedOut={onSignedOut} />

      {/*
        A linha do diretório de trabalho saiu daqui. Ela duplicava o chip que o
        composer já tem (`ContextChips`), e no rodapé aparecia como um "~" solto
        numa faixa larga — informação de contexto ocupando o lugar de identidade.
        Trocar de pasta continua a um clique, no chip.
      */}
    </aside>
  )
}
