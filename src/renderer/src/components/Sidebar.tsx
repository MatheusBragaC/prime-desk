import { useMemo, useState } from 'react'
import { useAgent, mutateFolders, openSession } from '@/store/agent'
import { groupSessions, withTitles } from '@/lib/grouping'
import { AccountBadge } from './AccountBadge'
import { useResizable } from '@/lib/useResizable'
import { useTitleBatch } from '@/lib/useTitleBatch'
import { ResizeHandle } from './ResizeHandle'
import { SidebarHeader } from './sidebar/SidebarHeader'
import { SidebarActions } from './sidebar/SidebarActions'
import { SidebarSearch } from './sidebar/SidebarSearch'
import { TitlingProgress } from './sidebar/TitlingProgress'
import { SessionList } from './sidebar/SessionList'

/**
 * Composição da coluna de conversas.
 *
 * A sidebar era um arquivo só com cromo, ações, busca, lote de títulos e
 * lista. Aqui ficaram as duas coisas que os pedaços não conseguem decidir
 * sozinhos: o recorte das sessões (filtro + agrupamento, que a lista consome
 * pronto) e a largura da coluna.
 */
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
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const size = useResizable('sidebar', 272, 200, 560, 'right')

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
  const runningPaths = useMemo(() => {
    const paths = new Set<string>()
    // `sessionPath` é opcional no protocolo, e ponte sem caminho não casa com
    // nenhuma linha da lista — fica fora do conjunto em vez de virar `undefined`.
    for (const r of parkedRuns) if (r.running && r.sessionPath) paths.add(r.sessionPath)
    return paths
  }, [parkedRuns])

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

  const titles = useTitleBatch(untitled)

  async function open(path: string) {
    setBusy(true)
    await openSession(path)
    setBusy(false)
    onNavigate?.()
  }

  /** A pasta só nasce com nome: evita ficar acumulando "Nova pasta" vazia. */
  async function createFolder(name: string) {
    setCreating(false)
    if (!name) return
    const id = 'f' + Date.now().toString(36)
    await mutateFolders((s) => ({
      ...s,
      folders: [...s.folders, { id, name, order: s.folders.length }]
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
        onNudge={size.nudge}
        width={size.width}
        min={size.min}
        max={size.max}
      />
      <SidebarHeader />

      <SidebarActions
        untitledCount={untitled.length}
        titling={titles.titling}
        archivedCount={archivedCount}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        onNewFolder={() => setCreating(true)}
        onTitleAll={titles.run}
      />

      <SidebarSearch value={query} onChange={setQuery} />

      {titles.titling && (
        <TitlingProgress done={titles.titling.done} total={titles.titling.total} />
      )}

      <SessionList
        groups={groups}
        activeId={state?.sessionId}
        busy={busy}
        searching={query.trim().length > 0}
        inUseIds={inUseIds}
        runningPaths={runningPaths}
        onOpen={(path) => void open(path)}
        creating={creating}
        onCreateFolder={(name) => void createFolder(name)}
        onCancelCreate={() => setCreating(false)}
      />

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
