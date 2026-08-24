import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Composer } from './components/Composer'
import { Message } from './components/Message'
import { Welcome } from './components/Welcome'
import { CommandPalette } from './components/CommandPalette'
import { AgentTree } from './components/AgentTree'
import { ObservedPanel } from './components/ObservedPanel'
import { Notice } from './components/Notice'
import { FilesPanel } from './components/FilesPanel'
import { FileViewer } from './components/FileViewer'
import {
  useAgent, refreshState, refreshModels, refreshCommands, refreshSessions,
  refreshFolders, abortTurn
} from './store/agent'
import type { AgentEvent, AgentTreeSnapshot } from '../../shared/protocol'

export function App() {
  const [palette, setPalette] = useState(false)
  // Dock único à direita: dois painéis simultâneos espremiam a conversa a ponto
  // de o composer ficar inutilizável em janela normal.
  const [dock, setDock] = useState<'files' | 'agents' | null>(null)
  const treeOpen = dock === 'agents'
  const filesOpen = dock === 'files'
  const [fileDraft, setFileDraft] = useState<string | undefined>()
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [home, setHome] = useState('')
  const messages = useAgent((s) => s.messages)
  const tools = useAgent((s) => s.tools)
  const fatal = useAgent((s) => s.fatal)
  const observed = useAgent((s) => s.observed)
  const watchedIds = Object.keys(observed)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // ---- ciclo de vida da ponte -------------------------------------------
  useEffect(() => {
    const store = useAgent.getState()

    const offEvent = window.prime.on('agent:event', (p) => {
      const ev = p as AgentEvent & { activeSessionId?: string; event?: AgentEvent; error?: string }

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
      if (ev.type === 'agent_end') void refreshSessions()
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
          `O agente encerrou inesperadamente (código ${info?.code ?? '?'}).\n` +
            (info?.stderr ?? '').slice(-600)
        )
      }
    })

    async function boot() {
      store.setStatus('starting')
      const info = await window.prime.appInfo()
      setHome(info.home)

      const r = await window.prime.startBridge({ cwd: info.home })
      if (!r?.ok) {
        store.setFatal('Não foi possível iniciar o prime-agent.')
        return
      }
      // O cwd efetivo vem do main, não do que pedimos: se a ponte já estava de
      // pé (recarga do renderer), o diretório real é o dela.
      store.setCwd(r.cwd ?? info.home)

      // O worker do daemon leva alguns segundos para aceitar comandos.
      for (let i = 0; i < 30; i++) {
        await new Promise((res) => setTimeout(res, 700))
        await refreshState()
        if (useAgent.getState().state) break
      }
      if (!useAgent.getState().state) {
        store.setFatal('O agente iniciou mas não respondeu a get_state.')
        return
      }

      store.setStatus('ready')
      void refreshModels()
      void refreshCommands()
      void refreshSessions()
      void refreshFolders()
    }

    void boot()

    return () => {
      offEvent()
      offErr()
      offFatal()
      offExit()
      offTree()
      offTreeErr()
      void window.prime.stopBridge()
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
      if (e.key === 'Escape' && useAgent.getState().state?.isStreaming) {
        void abortTurn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  async function pickCwd() {
    const r = await window.prime.pickDirectory()
    if (!r?.ok) return
    const store = useAgent.getState()
    store.setStatus('starting')
    store.reset()
    await window.prime.stopBridge()
    const started = await window.prime.startBridge({ cwd: r.path })
    store.setCwd(started?.cwd ?? r.path)
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 700))
      await refreshState()
      if (useAgent.getState().state) break
    }
    store.setStatus('ready')
    void refreshSessions()
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--p-bg)]">
      <Sidebar
        home={home}
        onPickCwd={() => void pickCwd()}
        onToggleTree={() => setDock((d) => (d === 'agents' ? null : 'agents'))}
        treeOpen={treeOpen}
      />

      <main className="relative flex min-w-[420px] flex-1 flex-col">
        <div className="aurora pointer-events-none absolute inset-0" />
        <StatusBar />
        <Notice />

        {fatal ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <div className="max-w-[560px] rounded-xl border border-err/30 bg-err/[0.07] p-5">
              <div className="text-[14px] font-semibold text-err">Falha na ponte com o agente</div>
              <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-muted">
                {fatal}
              </pre>
              <div className="mt-3 text-[12.5px] text-dim">
                Verifique se <span className="font-mono">prime-agent</span> está no PATH e
                autenticado (<span className="font-mono">prime-agent</span> no terminal).
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={scroller}
            onScroll={onScroll}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto"
          >
            {messages.length === 0 ? (
              <Welcome />
            ) : (
              <div className="mx-auto max-w-[860px] py-4">
                {messages.map((m) => (
                  <Message key={m.key} msg={m} tools={tools} />
                ))}
                <div className="h-4" />
              </div>
            )}
          </div>
        )}

        <div className="relative z-10 mx-auto w-full max-w-[860px]">
          <Composer
            onOpenPalette={() => setPalette(true)}
            onPickCwd={() => void pickCwd()}
            onToggleFiles={() => setDock((d) => (d === 'files' ? null : 'files'))}
            home={home}
            draft={fileDraft}
            onDraftConsumed={() => setFileDraft(undefined)}
          />
        </div>

        {/* Última sessão observada fica em foco; as outras seguem acumulando em background. */}
        {watchedIds.length > 0 && (
          <ObservedPanel activeSessionId={watchedIds[watchedIds.length - 1]} />
        )}

        {openFile && <FileViewer path={openFile} onClose={() => setOpenFile(null)} />}
      </main>

      {filesOpen && (
        <FilesPanel
          onClose={() => setDock(null)}
          onOpenFile={(p) => setOpenFile(p)}
          onQuote={(p) => setFileDraft(p)}
        />
      )}

      {treeOpen && <AgentTree onClose={() => setDock(null)} />}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
