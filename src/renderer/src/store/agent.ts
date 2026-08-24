import { create } from 'zustand'
import type {
  AgentEvent, AgentMessage, AgentState, ModelInfo, SessionSummary,
  ThinkingLevel, BridgeStatus, RpcResponse, AgentTreeSnapshot, FolderState
} from '../../../shared/protocol'
import {
  applyEvent, emptyTranscript, hydrate, type Totals, type ToolExec, type Transcript, type UiMessage
} from './transcript'
import { t } from '../i18n'

export type { UiMessage, ToolExec } from './transcript'

/** Pedido de confirmação exibido pelo diálogo único do app. */
export interface ConfirmRequest {
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

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
  notice: { kind: 'error' | 'info'; text: string; at: number } | null
  confirm: ConfirmRequest | null

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
  notify: (kind: 'error' | 'info', text: string) => void
  clearNotice: () => void
  requestConfirm: (req: ConfirmRequest) => void
  closeConfirm: () => void
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
  notice: null,
  confirm: null,

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
  notify: (kind, text) => set({ notice: { kind, text, at: Date.now() } }),
  clearNotice: () => set({ notice: null }),
  requestConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),
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

export interface RpcOutcome<T> {
  ok: boolean
  data: T | null
  error?: string
}

/** Chamada crua: devolve o erro em vez de engolir. */
export async function rpcCall<T = unknown>(
  type: string,
  payload?: Record<string, unknown>
): Promise<RpcOutcome<T>> {
  const r = await bridge().send(type, payload)
  if (!r?.ok) return { ok: false, data: null, error: r?.error ?? 'Falha de transporte.' }
  const res = r.res as RpcResponse<T>
  if (!res.success) return { ok: false, data: null, error: res.error ?? `Comando "${type}" falhou.` }
  return { ok: true, data: (res.data ?? null) as T | null }
}

export async function rpc<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T | null> {
  const out = await rpcCall<T>(type, payload)
  if (!out.ok) console.warn('[rpc]', type, out.error)
  return out.data
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

/**
 * Abre uma sessão salva.
 *
 * `switch_session` recebe **sessionPath**, não sessionId — mandar o campo errado
 * faz o comando falhar em silêncio e a seleção nunca sai do lugar.
 */
export async function openSession(sessionPath: string): Promise<void> {
  const store = useAgent.getState()
  const out = await rpcCall<{ cancelled?: boolean }>('switch_session', { sessionPath })

  if (!out.ok) {
    const already = /already active/i.test(out.error ?? '')
    store.notify('error', already ? t('session.alreadyOpen') : (out.error ?? t('session.openFailed')))
    return
  }
  if (out.data?.cancelled) {
    store.notify('info', t('session.switchCancelled'))
    return
  }

  store.reset()
  const data = await rpc<{ messages: AgentMessage[] }>('get_messages')
  if (data?.messages) store.loadHistory(data.messages)
  await refreshState()
  void refreshSessions()
}

/**
 * Exclui o arquivo de uma conversa.
 *
 * Se ela for a que está aberta, o worker ainda a mantém carregada — por isso
 * trocamos para uma sessão nova antes de apagar. Sem isso, excluir a conversa
 * atual não funcionava.
 */
export async function deleteSession(sessionId: string, path: string): Promise<boolean> {
  const store = useAgent.getState()
  const isActive = store.state?.sessionId === sessionId

  if (isActive) {
    await rpc('new_session')
    store.reset()
    await refreshState()
  }

  const r = await bridge().deleteSession(path)
  if (!r?.ok) {
    store.notify('error', r?.error ?? t('delete.failed'))
    return false
  }

  store.notify('info', t('delete.done'))
  void refreshSessions()
  return true
}

// ------------------------------------------------------------------ título

function plainText(m: UiMessage): string {
  return m.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim()
}

let titling = false

/**
 * Dá nome à conversa depois do primeiro turno.
 *
 * O nome é gravado com `set_session_name`, então vive no próprio arquivo de
 * sessão (entrada `session_info`) e aparece também no TUI — não é um rótulo
 * paralelo só da GUI.
 */
export async function maybeGenerateTitle(): Promise<void> {
  if (titling) return
  const st = useAgent.getState()
  if (st.state?.sessionName) return

  const msgs = st.messages
  const user = msgs.find((m) => m.role === 'user')
  const assistant = msgs.find((m) => m.role === 'assistant')
  if (!user || !assistant) return

  titling = true
  try {
    const convo =
      `usuário: ${plainText(user).slice(0, 900)}\n` +
      `assistente: ${plainText(assistant).slice(0, 700)}`

    const r = await bridge().generateTitle(convo)
    const title = r?.ok ? (r.title as string | null) : null
    if (!title) return

    await rpc('set_session_name', { name: title })
    await refreshState()
    void refreshSessions()
  } finally {
    titling = false
  }
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
      error: t('observed.failed')
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
