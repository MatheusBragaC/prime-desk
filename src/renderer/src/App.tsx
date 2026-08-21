import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Composer } from './components/Composer'
import { Message } from './components/Message'
import { Welcome } from './components/Welcome'
import { CommandPalette } from './components/CommandPalette'
import { AgentTree } from './components/AgentTree'
import {
  useAgent, refreshState, refreshModels, refreshCommands, refreshSessions,
  refreshFolders, abortTurn
} from './store/agent'
import type { AgentEvent, AgentTreeSnapshot } from '../../shared/protocol'

export function App() {
  const [palette, setPalette] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [home, setHome] = useState('')
  const messages = useAgent((s) => s.messages)
  const tools = useAgent((s) => s.tools)
  const fatal = useAgent((s) => s.fatal)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // ---- ciclo de vida da ponte -------------------------------------------
  useEffect(() => {
    const store = useAgent.getState()

    const offEvent = window.prime.on('agent:event', (p) => store.ingest(p as AgentEvent))
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
      store.setCwd(info.home)

      const r = await window.prime.startBridge({ cwd: info.home })
      if (!r?.ok) {
        store.setFatal('Não foi possível iniciar o prime-agent.')
        return
      }

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
        setTreeOpen((v) => !v)
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
    store.setCwd(r.path)
    await window.prime.startBridge({ cwd: r.path })
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
        onToggleTree={() => setTreeOpen((v) => !v)}
        treeOpen={treeOpen}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="aurora pointer-events-none absolute inset-0" />
        <StatusBar />

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
          <Composer onOpenPalette={() => setPalette(true)} />
        </div>
      </main>

      {treeOpen && <AgentTree onClose={() => setTreeOpen(false)} />}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  )
}
