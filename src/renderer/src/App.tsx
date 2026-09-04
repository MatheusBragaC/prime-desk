import { useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { StatusBar, type Dock } from './components/StatusBar'
import { Composer } from './components/Composer'
import { Message } from './components/Message'
import { Welcome } from './components/Welcome'
import { CommandPalette } from './components/CommandPalette'
import { AgentTree } from './components/AgentTree'
import { ObservedPanel } from './components/ObservedPanel'
import { Notice } from './components/Notice'
import type { SshConnection } from './components/Composer'
import { SshModal, type SshForm } from './components/SshModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Onboarding } from './components/Onboarding'
import { PendingBubble } from './components/PendingBubble'
import { useWindowWidth, DOCK_MIN_WIDTH, SIDEBAR_MIN_WIDTH } from './lib/useWindowWidth'

/** Mensagens renderizadas por vez ao abrir uma conversa. */
const PAGE_SIZE = 60
import { useT } from './i18n'
import { FilesPanel } from './components/FilesPanel'
import { DiffPanel } from './components/DiffPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { FileViewer } from './components/FileViewer'
import {
  useAgent, refreshState, refreshModels, refreshCommands, refreshSessions,
  refreshFolders, abortTurn, maybeGenerateTitle
} from './store/agent'
import type { AgentEvent, AgentTreeSnapshot } from '../../shared/protocol'

export function App() {
  const { t } = useT()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [palette, setPalette] = useState(false)
  // Dock único à direita: dois painéis simultâneos espremiam a conversa a ponto
  // de o composer ficar inutilizável em janela normal.
  const [dock, setDock] = useState<Dock>(null)
  const width = useWindowWidth()
  const narrowDock = width < DOCK_MIN_WIDTH
  const narrowSidebar = width < SIDEBAR_MIN_WIDTH
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const treeOpen = dock === 'agents'
  const filesOpen = dock === 'files'

  /*
    Em janela estreita a sidebar deixa de ocupar coluna própria e passa a
    sobrepor a conversa, como fazem os apps de chat em tela dividida.
  */
  useEffect(() => {
    setSidebarOpen(!narrowSidebar)
  }, [narrowSidebar])

  // Painel lateral e conversa não cabem juntos abaixo do limite.
  useEffect(() => {
    if (narrowDock) setDock(null)
  }, [narrowDock])
  const [fileDraft, setFileDraft] = useState<string | undefined>()
  const [openFile, setOpenFile] = useState<string | null>(null)
  /*
    Conversas longas chegam a milhares de mensagens. Renderizar tudo de uma vez
    trava a troca, porque cada bloco reprocessa markdown e realce de sintaxe.
    Mostramos uma janela recente e o resto sob demanda.
  */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Modais vivem aqui, no nível mais estável da árvore: um diálogo não deve
  // depender do ciclo de vida de um chip da barra de contexto.
  const [sshModal, setSshModal] = useState(false)
  const [connections, setConnections] = useState<SshConnection[]>([])
  const [home, setHome] = useState('')
  const messages = useAgent((s) => s.messages)
  const tools = useAgent((s) => s.tools)
  const fatal = useAgent((s) => s.fatal)
  const streaming = useAgent((s) => s.state?.isStreaming ?? false)
  const loadingSession = useAgent((s) => s.loadingSession)
  const sessionId = useAgent((s) => s.state?.sessionId)
  const observed = useAgent((s) => s.observed)
  const watchedIds = Object.keys(observed)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  /** Conversa cuja abertura já foi posicionada no fim. */
  const scrolledFor = useRef<string | null>(null)
  const zoomRef = useRef(0)

  const applyZoom = useCallback(async (level: number) => {
    const r = await window.prime.setZoom(level)
    if (r?.ok) {
      zoomRef.current = r.level as number
      localStorage.setItem('prime-desk:zoom', String(r.level))
    }
  }, [])

  // Restaura o zoom escolhido antes de a janela aparecer.
  useEffect(() => {
    const saved = Number(localStorage.getItem('prime-desk:zoom'))
    if (Number.isFinite(saved) && saved !== 0) void applyZoom(saved)
  }, [applyZoom])

  // ---- ciclo de vida da ponte -------------------------------------------
  useEffect(() => {
    const store = useAgent.getState()

    const offEvent = window.prime.on('agent:event', (p) => {
      const ev = p as AgentEvent & {
        activeSessionId?: string
        event?: AgentEvent
        error?: string
        bridgeId?: string
      }

      /*
        Evento de ponte estacionada: aquele turno continua rodando fora da tela e
        não pode escrever na conversa que está aberta. O aviso de término chega
        pelo canal `bridge:run-ended`.
      */
      const activeBridge = useAgent.getState().activeBridgeId
      if (ev.bridgeId && activeBridge && ev.bridgeId !== activeBridge) return

      // Eventos de sessões observadas vêm embrulhados para não se confundirem
      // com os da sessão própria. Roteia para o namespace do observado.
      if (ev.type === 'observed_session_event' && ev.activeSessionId && ev.event) {
        store.ingestObserved(ev.activeSessionId, ev.event)
        return
      }
      if (ev.type === 'observed_session_closed' && ev.activeSessionId) {
        store.upsertObserved(ev.activeSessionId, {
          status: ev.error ? 'error' : 'closed',
          error: ev.error
        })
        return
      }

      store.ingest(ev)

      // A sessão só entra no catálogo quando ganha a primeira mensagem; sem
      // isto a conversa recém-criada ficaria invisível até um refresh manual.
      if (ev.type === 'agent_end') {
        void refreshSessions()
        void maybeGenerateTitle()
      }
    })
    const offParked = window.prime.on('bridge:parked', (p) =>
      store.setParkedRuns(p as Parameters<typeof store.setParkedRuns>[0])
    )
    const offEnded = window.prime.on('bridge:run-ended', (p) => {
      const info = p as { sessionPath?: string }
      const title = useAgent.getState().sessions.find((x) => x.path === info.sessionPath)?.title
      store.notify('info', t('session.runFinished', { name: title ?? '' }).trim())
      void refreshSessions()
    })
    const offErr = window.prime.on('agent:stderr', (p) => store.applyStderr(String(p)))
    const offFatal = window.prime.on('agent:fatal', (p) => store.setFatal(String(p)))
    const offTree = window.prime.on('agents:tree', (p) =>
      store.setTree(p as AgentTreeSnapshot)
    )
    const offTreeErr = window.prime.on('agents:tree-error', (p) =>
      store.setTreeError(String(p))
    )
    const offExit = window.prime.on('agent:exit', (p) => {
      const info = p as { expected?: boolean; code?: number; stderr?: string }
      if (info?.expected) {
        store.setStatus('stopped')
      } else {
        store.setFatal(
          t('bridge.exited', { code: info?.code ?? '?' }) + '\n' + (info?.stderr ?? '').slice(-600)
        )
      }
    })

    async function boot() {
      store.setStatus('starting')
      const info = await window.prime.appInfo()
      setHome(info.home)
      store.setPlatform(info.platform)

      // Ambiente incompleto: onboarding assume a tela antes de tentar a ponte.
      const env = await window.prime.checkEnvironment()
      const ready = env?.ok && env.status.agent.installed && env.status.auth.ok
      setNeedsSetup(!ready)
      if (!ready) return

      const r = await window.prime.startBridge({ cwd: info.home })
      if (!r?.ok) {
        store.setFatal(t('bridge.cantStart'))
        return
      }
      // O cwd efetivo vem do main, não do que pedimos: se a ponte já estava de
      // pé (recarga do renderer), o diretório real é o dela.
      store.setCwd(r.cwd ?? info.home)
      store.setActiveBridge((r.bridgeId as string) ?? null)

      // O worker do daemon leva alguns segundos para aceitar comandos.
      for (let i = 0; i < 30; i++) {
        await new Promise((res) => setTimeout(res, 700))
        await refreshState()
        if (useAgent.getState().state) break
      }
      if (!useAgent.getState().state) {
        store.setFatal(t('bridge.noState'))
        return
      }

      store.setStatus('ready')
      void refreshModels()
      void refreshCommands()
      void refreshSessions()
      void refreshFolders()
      void window.prime.listSshConnections().then((res) => {
        if (res?.ok) setConnections(res.connections as SshConnection[])
      })
    }

    void boot()

    return () => {
      offEvent()
      offParked()
      offEnded()
      offErr()
      offFatal()
      offExit()
      offTree()
      offTreeErr()
      void window.prime.stopBridge()
    }
  }, [])

  /*
    Soltar um arquivo fora do composer faria o Electron navegar para ele,
    substituindo a interface pelo arquivo. Bloqueamos na janela inteira.
  */
  /*
    Ritmo da árvore de agentes, decidido aqui porque é aqui que se sabe o que
    está na tela. Cada ciclo custa um `prime-agent list` — 0,67s de CPU medidos —
    então parado ele fica desligado: nada muda quando nada roda.
  */
  useEffect(() => {
    const ms = dock === 'agents' ? 2000 : streaming ? 8000 : 0
    void window.prime.setAgentCadence(ms)
  }, [dock, streaming])

  useEffect(() => {
    const block = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  // ---- atalhos -----------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setDock((d) => (d === 'agents' ? null : 'agents'))
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setDock((d) => (d === 'files' ? null : 'files'))
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setDock((d) => (d === 'diff' ? null : 'diff'))
      }
      // Crase é onde VS Code e Claude Desktop põem o terminal.
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        setDock((d) => (d === 'terminal' ? null : 'terminal'))
      }

      // Zoom da interface. `=` cobre o Ctrl+= sem Shift, comum em teclado ABNT.
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault()
          void applyZoom(zoomRef.current + 0.5)
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          void applyZoom(zoomRef.current - 0.5)
        } else if (e.key === '0') {
          e.preventDefault()
          void applyZoom(0)
        }
      }
      if (e.key === 'Escape' && useAgent.getState().state?.isStreaming) {
        void abortTurn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyZoom])

  /**
   * A resposta ainda não apareceu: ou o assistente nem começou, ou já começou
   * mas só tem blocos vazios. Nos dois casos o usuário precisa de um sinal no
   * lugar onde a resposta vai surgir.
   */
  // Ao trocar de conversa a janela volta ao tamanho padrão.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [sessionId, loadingSession])

  /*
    Abrir uma conversa deve mostrar o fim dela, não o começo.

    Duas coisas atrapalhavam: enquanto carrega, o container do scroll é
    substituído pelo indicador e volta a montar zerado; e a altura final só
    existe depois que markdown e realce de sintaxe são aplicados, o que acontece
    em quadros seguintes. Por isso o ajuste é repetido por alguns quadros.
  */
  useEffect(() => {
    if (loadingSession || messages.length === 0) return

    // Uma vez por conversa: sem esta guarda, cada mensagem nova durante o
    // streaming roubaria o scroll de quem subiu para reler algo.
    const key = sessionId ?? ''
    if (scrolledFor.current === key) return
    scrolledFor.current = key

    pinned.current = true

    const el = scroller.current
    if (!el) return

    const stick = (): void => {
      el.scrollTop = el.scrollHeight
    }
    stick()

    /*
      A altura só se estabiliza depois da primeira pintura: imagens anexadas
      carregam, o destaque de sintaxe re-renderiza os blocos de código e as
      fontes embutidas reflowam o texto. Seis quadros de `requestAnimationFrame`
      (~100ms) terminavam antes disso e a conversa abria no meio. Aqui a gente
      cola no fim enquanto o conteúdo estiver crescendo, por até dois segundos.
    */
    const content = el.firstElementChild
    const ro = new ResizeObserver(stick)
    if (content) ro.observe(content)

    const imgs = Array.from(el.querySelectorAll('img'))
    for (const img of imgs) img.addEventListener('load', stick)

    const release = (): void => {
      ro.disconnect()
      for (const img of imgs) img.removeEventListener('load', stick)
    }
    const timer = setTimeout(release, 2000)

    return () => {
      clearTimeout(timer)
      release()
    }
  }, [sessionId, loadingSession, messages.length])

  /** Conversa sem conteúdo: a tela inicial troca o layout do palco. */
  const isEmpty = !loadingSession && !fatal && messages.length === 0

  const hiddenCount = Math.max(0, messages.length - visibleCount)
  const visibleMessages = hiddenCount > 0 ? messages.slice(hiddenCount) : messages

  const last = messages[messages.length - 1]
  const showPending =
    streaming &&
    (!last ||
      last.role === 'user' ||
      (last.role === 'assistant' &&
        !last.content.some(
          (b) =>
            (b.type === 'text' && b.text.trim().length > 0) ||
            (b.type === 'thinking' && b.thinking.trim().length > 0) ||
            b.type === 'toolCall'
        )))

  // ---- autoscroll aderente ----------------------------------------------
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [messages, tools])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }

  async function persistConnections(list: SshConnection[]) {
    const r = await window.prime.saveSshConnections(list)
    if (r?.ok) setConnections(r.connections as SshConnection[])
  }

  async function addConnection(form: SshForm) {
    setSshModal(false)
    const conn: SshConnection = {
      id: 'c' + Date.now().toString(36),
      name: form.name,
      host: form.host.trim(),
      port: form.port ? Number(form.port) : undefined,
      identity: form.identity.trim() || undefined,
      remotePath: form.remotePath.trim() || undefined
    }
    await persistConnections([...connections, conn])
    await setExecution(conn)
  }

  /** Reinicia a ponte no destino escolhido (local ou SSH). */
  async function setExecution(conn: SshConnection | null) {
    const store = useAgent.getState()
    store.setStatus('starting')
    store.reset()
    await window.prime.stopBridge()

    const r = await window.prime.startBridge({
      cwd: store.cwd,
      ssh: conn ? (conn.remotePath ? `${conn.host}:${conn.remotePath}` : conn.host) : undefined,
      sshPort: conn?.port,
      sshIdentity: conn?.identity
    })
    if (!r?.ok) {
      store.setStatus('error')
      store.notify('error', r?.error ?? 'Não foi possível iniciar nesse destino.')
      const back = await window.prime.startBridge({ cwd: store.cwd })
      store.setActiveBridge((back?.bridgeId as string) ?? null)
      return
    }

    store.setActiveBridge((r.bridgeId as string) ?? null)
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 700))
      await refreshState()
      if (useAgent.getState().state) break
    }
    store.setStatus('ready')
    store.notify('info', conn ? t('exec.runningOn', { name: conn.name }) : t('exec.runningLocal'))
  }

  async function pickCwd() {
    const r = await window.prime.pickDirectory()
    if (!r?.ok) return
    const store = useAgent.getState()
    store.setStatus('starting')
    store.reset()
    await window.prime.stopBridge()
    const started = await window.prime.startBridge({ cwd: r.path })
    store.setCwd(started?.cwd ?? r.path)
    store.setActiveBridge((started?.bridgeId as string) ?? null)
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 700))
      await refreshState()
      if (useAgent.getState().state) break
    }
    store.setStatus('ready')
    void refreshSessions()
  }

  if (needsSetup) {
    return (
      <Onboarding
        onReady={() => {
          setNeedsSetup(false)
          // Recarrega para refazer o boot completo com o ambiente já pronto.
          window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--p-bg)]">
      {narrowSidebar && sidebarOpen && (
        <div
          className="fixed inset-0 z-scrim bg-black/50 animate-fade-up"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={
          narrowSidebar
            ? 'fixed inset-y-0 left-0 z-panel transition-transform duration-200 ' +
              (sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full')
            : 'contents'
        }
      >
      <Sidebar
        onSignedOut={() => setNeedsSetup(true)}
        home={home}
        onNavigate={() => narrowSidebar && setSidebarOpen(false)}
      />
      </div>

      <main className="relative flex min-w-[420px] flex-1 flex-col">
        <div className="aurora pointer-events-none absolute inset-0" />
        <StatusBar
          onToggleSidebar={narrowSidebar ? () => setSidebarOpen((v) => !v) : undefined}
          dock={dock}
          onDock={(kind) => setDock((d) => (d === kind ? null : kind))}
        />
        <Notice />

        {/*
          Conversa vazia: a saudação e o composer formam um grupo só, centrado na
          área útil — é assim no Claude Desktop. Com conteúdo, o rolador volta a
          ocupar tudo e o composer se fixa no rodapé.
        */}
        <div
          className={
            'relative z-10 flex min-h-0 flex-1 flex-col ' + (isEmpty ? 'justify-center' : '')
          }
        >
        {fatal ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <div className="max-w-[560px] rounded-xl border border-err/30 bg-err/[0.07] p-5">
              <div className="text-base font-semibold text-err">{t('bridge.fatalTitle')}</div>
              <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-sm text-muted">
                {fatal}
              </pre>
              <div className="mt-3 text-sm text-dim">{t('bridge.fatalHint')}</div>
            </div>
          </div>
        ) : (
          <div
            ref={scroller}
            onScroll={onScroll}
            className={
              'relative z-10 overflow-y-auto ' + (isEmpty ? 'shrink-0' : 'min-h-0 flex-1')
            }
          >
            {loadingSession ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-dim">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {t('chat.opening')}
              </div>
            ) : messages.length === 0 ? (
              <Welcome />
            ) : (
              <div className="mx-auto max-w-col pb-2 pt-1">
                {hiddenCount > 0 && (
                  <div className="mb-2 flex flex-col items-center gap-1 px-6">
                    <button
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      className="rounded-field px-3 py-1.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-fg"
                    >
                      {t('chat.loadOlder')}
                    </button>
                    <span className="text-micro text-dim">
                      {t('chat.hiddenCount', { n: hiddenCount })}
                    </span>
                  </div>
                )}
                {visibleMessages.map((m, i) => (
                  <Message
                    key={m.key}
                    msg={m}
                    tools={tools}
                    continuation={i > 0 && visibleMessages[i - 1].role === m.role}
                  />
                ))}
                {showPending && <PendingBubble />}
                <div className="h-6" />
              </div>
            )}
          </div>
        )}

        <div className="relative z-10 mx-auto w-full max-w-col">
          <Composer
            onOpenPalette={() => setPalette(true)}
            onPickCwd={() => void pickCwd()}
            onSetExecution={(conn) => void setExecution(conn)}
            connections={connections}
            onOpenSshModal={() => setSshModal(true)}
            onRemoveConnection={(id) =>
              void persistConnections(connections.filter((x) => x.id !== id))
            }
            home={home}
            draft={fileDraft}
            onDraftConsumed={() => setFileDraft(undefined)}
          />
        </div>
        </div>

        {/* Última sessão observada fica em foco; as outras seguem acumulando em background. */}
        {watchedIds.length > 0 && <ObservedPanel />}

        {openFile && <FileViewer path={openFile} onClose={() => setOpenFile(null)} />}
      </main>

      {filesOpen && (
        <FilesPanel
          onClose={() => setDock(null)}
          onOpenFile={(p) => setOpenFile(p)}
          onQuote={(p) => setFileDraft(p)}
        />
      )}

      {dock === 'diff' && <DiffPanel onClose={() => setDock(null)} />}

      {dock === 'terminal' && <TerminalPanel onClose={() => setDock(null)} />}

      {treeOpen && <AgentTree onClose={() => setDock(null)} />}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />

      <SshModal open={sshModal} onClose={() => setSshModal(false)} onSubmit={addConnection} />

      <ConfirmDialog />
    </div>
  )
}
