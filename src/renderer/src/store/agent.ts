import { create } from 'zustand'
import type {
  AgentEvent, AgentMessage, AgentState, ModelInfo, SessionSummary,
  ThinkingLevel, BridgeStatus, RpcResponse, AgentTreeSnapshot, FolderState
} from '../../../shared/protocol'
import {
  applyEvent, emptyTranscript, hydrate, type Totals, type ToolExec, type Transcript, type UiMessage
} from './transcript'

export type { UiMessage, ToolExec } from './transcript'

export interface CommandInfo {
  name: string
  description: string
  source: string
}

/** Uma sessão de outro agente acompanhada ao vivo via `observe`. */
export interface Observed {
  activeSessionId: string
  name: string
  transcript: Transcript
  status: 'loading' | 'live' | 'closed' | 'error'
  error?: string
  /** Última atividade recebida, para dar sinal de vida na UI. */
  lastEventAt: number
}

interface AgentStore {
  status: BridgeStatus
  fatal: string | null
  stderr: string
  state: AgentState | null
  models: ModelInfo[]
  commands: CommandInfo[]
  sessions: SessionSummary[]
  messages: UiMessage[]
  tools: Record<string, ToolExec>
  totals: Totals
  cwd: string
  compacting: boolean
  retry: { attempt: number; max: number; message: string } | null
  tree: AgentTreeSnapshot | null
  treeError: string | null
  folders: FolderState
  observed: Record<string, Observed>

  setStatus: (s: BridgeStatus) => void
  setCwd: (c: string) => void
  ingest: (ev: AgentEvent) => void
  loadHistory: (messages: AgentMessage[]) => void
  applyStderr: (chunk: string) => void
  setFatal: (m: string | null) => void
  setState: (s: AgentState) => void
  setModels: (m: ModelInfo[]) => void
  setCommands: (c: CommandInfo[]) => void
  setSessions: (s: SessionSummary[]) => void
  setTree: (t: AgentTreeSnapshot) => void
  setTreeError: (e: string | null) => void
  setFolders: (f: FolderState) => void
  upsertObserved: (id: string, patch: Partial<Observed>) => void
  dropObserved: (id: string) => void
  ingestObserved: (id: string, ev: AgentEvent) => void
  reset: () => void
}

export const useAgent = create<AgentStore>((set, get) => ({
  status: 'idle',
  fatal: null,
  stderr: '',
  state: null,
  models: [],
  commands: [],
  sessions: [],
  messages: [],
  tools: {},
  totals: { tokens: 0, cost: 0 },
  cwd: '',
  compacting: false,
  retry: null,
  tree: null,
  treeError: null,
  folders: { folders: [], assignments: {}, collapsed: {} },
  observed: {},

  setStatus: (s) => set({ status: s }),
  setCwd: (c) => set({ cwd: c }),
  setFatal: (m) => set({ fatal: m, status: m ? 'error' : get().status }),
  setState: (s) => set({ state: s }),
  setModels: (models) => set({ models }),
  setCommands: (commands) => set({ commands }),
  setSessions: (sessions) => set({ sessions }),
  setTree: (tree) => set({ tree, treeError: null }),
  setTreeError: (treeError) => set({ treeError }),
  setFolders: (folders) => set({ folders }),
  applyStderr: (chunk) => set((st) => ({ stderr: (st.stderr + chunk).slice(-20000) })),

  reset: () => set({ ...emptyTranscript(), retry: null }),

  loadHistory: (messages) => set(hydrate(messages)),

  ingest: (ev) => {
    const st = get()
    const before: Transcript = { messages: st.messages, tools: st.tools, totals: st.totals }
    const after = applyEvent(before, ev)
    if (after !== before) set(after)

    switch (ev.type) {
      case 'agent_start':
        set((s) => ({ state: s.state ? { ...s.state, isStreaming: true } : s.state }))
        break
      case 'agent_end':
        set((s) => ({ state: s.state ? { ...s.state, isStreaming: false } : s.state }))
        break
      case 'session_action_update': {
        const a = (ev as { actions?: AgentState['sessionActions'] }).actions
        set((s) => ({ state: s.state && a ? { ...s.state, sessionActions: a } : s.state }))
        break
      }
      case 'compaction_start':
        set({ compacting: true })
        break
      case 'compaction_end':
        set({ compacting: false })
        break
      case 'auto_retry_start': {
        const e = ev as unknown as { attempt: number; maxAttempts: number; errorMessage: string }
        set({ retry: { attempt: e.attempt, max: e.maxAttempts, message: e.errorMessage } })
        break
      }
      case 'auto_retry_end':
        set({ retry: null })
        break
      default:
        break
    }
  },

  upsertObserved: (id, patch) =>
    set((st) => {
      const prev: Observed =
        st.observed[id] ?? {
          activeSessionId: id,
          name: '',
          transcript: emptyTranscript(),
          status: 'loading',
          lastEventAt: 0
        }
      return { observed: { ...st.observed, [id]: { ...prev, ...patch } } }
    }),

  dropObserved: (id) =>
    set((st) => {
      const next = { ...st.observed }
      delete next[id]
      return { observed: next }
    }),

  ingestObserved: (id, ev) =>
    set((st) => {
      const cur = st.observed[id]
      if (!cur) return {}
      const transcript = applyEvent(cur.transcript, ev)
      return {
        observed: {
          ...st.observed,
          [id]: { ...cur, transcript, lastEventAt: Date.now() }
        }
      }
    })
}))

// ------------------------------------------------------------------ comandos

const bridge = () => window.prime

export async function rpc<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T | null> {
  const r = await bridge().send(type, payload)
  if (!r?.ok) {
    console.warn('[rpc]', type, r?.error)
    return null
  }
  const res = r.res as RpcResponse<T>
  if (!res.success) {
    console.warn('[rpc]', type, res.error)
    return null
  }
  return (res.data ?? null) as T | null
}

export async function refreshState(): Promise<void> {
  const data = await rpc<AgentState>('get_state')
  if (data) useAgent.getState().setState(data)
}

export async function refreshModels(): Promise<void> {
  const data = await rpc<{ models: ModelInfo[] } | ModelInfo[]>('get_available_models')
  if (!data) return
  const models = Array.isArray(data) ? data : data.models
  if (models) useAgent.getState().setModels(models)
}

export async function refreshCommands(): Promise<void> {
  const data = await rpc<{ commands: CommandInfo[] }>('get_commands')
  if (data?.commands) useAgent.getState().setCommands(data.commands)
}

export async function refreshSessions(): Promise<void> {
  const r = await bridge().listSessions()
  if (r?.ok) useAgent.getState().setSessions(r.sessions as SessionSummary[])
}

export async function refreshFolders(): Promise<void> {
  const r = await bridge().loadFolders()
  if (r?.ok) useAgent.getState().setFolders(r.state as FolderState)
}

/** Atualiza pastas de forma otimista; o main sanitiza e devolve a verdade final. */
export async function mutateFolders(fn: (state: FolderState) => FolderState): Promise<void> {
  const next = fn(useAgent.getState().folders)
  useAgent.getState().setFolders(next)
  const r = await bridge().saveFolders(next)
  if (r?.ok) useAgent.getState().setFolders(r.state as FolderState)
}

export async function sendPrompt(
  message: string,
  images?: { data: string; mimeType: string }[]
): Promise<void> {
  const streaming = useAgent.getState().state?.isStreaming
  const payload: Record<string, unknown> = { message }
  if (images?.length) payload.images = images.map((i) => ({ type: 'image', ...i }))
  if (streaming) payload.streamingBehavior = 'steer'
  await rpc('prompt', payload)
  void refreshState()
}

export async function abortTurn(): Promise<void> {
  await bridge().fire('abort')
  void refreshState()
}

export async function setModel(id: string): Promise<void> {
  await rpc('set_model', { model: id })
  void refreshState()
}

export async function setThinking(level: ThinkingLevel): Promise<void> {
  await rpc('set_thinking_level', { level })
  void refreshState()
}

export async function compactNow(): Promise<void> {
  await rpc('compact')
}

export async function newSession(): Promise<void> {
  await rpc('new_session')
  useAgent.getState().reset()
  void refreshState()
  void refreshSessions()
}

export async function openSession(sessionId: string): Promise<void> {
  await rpc('switch_session', { sessionId })
  useAgent.getState().reset()
  const data = await rpc<{ messages: AgentMessage[] }>('get_messages')
  if (data?.messages) useAgent.getState().loadHistory(data.messages)
  void refreshState()
}

// ------------------------------------------------------------------ observe

/**
 * Assina os eventos de outra sessão (root ou subagente).
 *
 * A resposta de `observe` já traz o histórico; os eventos seguintes chegam
 * embrulhados em `observed_session_event` e são bufferizados pelo agente até a
 * resposta ser entregue, então não há janela de perda.
 */
export async function observeSession(activeSessionId: string, name: string): Promise<void> {
  const store = useAgent.getState()
  store.upsertObserved(activeSessionId, { name, status: 'loading' })

  const data = await rpc<{ messages: AgentMessage[] }>('observe', { activeSessionId })
  if (!data) {
    store.upsertObserved(activeSessionId, {
      status: 'error',
      error: 'Não foi possível observar esta sessão. Ela pode já ter encerrado.'
    })
    return
  }
  store.upsertObserved(activeSessionId, {
    transcript: hydrate(data.messages ?? []),
    status: 'live',
    lastEventAt: Date.now()
  })
}

export async function unobserveSession(activeSessionId: string): Promise<void> {
  await bridge().fire('unobserve', { activeSessionId })
  useAgent.getState().dropObserved(activeSessionId)
}
