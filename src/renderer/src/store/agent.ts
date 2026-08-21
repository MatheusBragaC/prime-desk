import { create } from 'zustand'
import type {
  AgentEvent, AgentState, ContentBlock, ModelInfo, SessionSummary,
  ThinkingLevel, ToolResult, Usage, BridgeStatus, RpcResponse
} from '../../../shared/protocol'

export interface UiMessage {
  key: string
  role: 'user' | 'assistant'
  content: ContentBlock[]
  usage?: Usage
  timestamp: number
  streaming: boolean
}

export interface ToolExec {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'ok' | 'error'
  text: string
  durationMs?: number
  stderr?: string
  kernelRestarted?: boolean
}

export interface CommandInfo {
  name: string
  description: string
  source: string
}

interface Totals { tokens: number; cost: number }

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

  setStatus: (s: BridgeStatus) => void
  setCwd: (c: string) => void
  ingest: (ev: AgentEvent) => void
  applyStderr: (chunk: string) => void
  setFatal: (m: string | null) => void
  setState: (s: AgentState) => void
  setModels: (m: ModelInfo[]) => void
  setCommands: (c: CommandInfo[]) => void
  setSessions: (s: SessionSummary[]) => void
  reset: () => void
}

function textOf(result?: ToolResult): string {
  if (!result) return ''
  const fromContent = (result.content ?? [])
    .map((c) => c.text ?? '')
    .join('')
  if (fromContent) return fromContent
  return result.details?.stdout ?? ''
}

/** Identidade estável de mensagem: role + timestamp emitido pelo agente. */
function keyOf(role: string, timestamp?: number): string {
  return `${role}:${timestamp ?? 0}`
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

  setStatus: (s) => set({ status: s }),
  setCwd: (c) => set({ cwd: c }),
  setFatal: (m) => set({ fatal: m, status: m ? 'error' : get().status }),
  setState: (s) => set({ state: s }),
  setModels: (models) => set({ models }),
  setCommands: (commands) => set({ commands }),
  setSessions: (sessions) => set({ sessions }),
  applyStderr: (chunk) => set((st) => ({ stderr: (st.stderr + chunk).slice(-20000) })),

  reset: () => set({ messages: [], tools: {}, totals: { tokens: 0, cost: 0 }, retry: null }),

  ingest: (ev) => {
    const type = ev.type

    // ---- streaming de mensagens -------------------------------------------
    // message_update carrega o SNAPSHOT completo de message.content, então
    // basta sobrescrever: renderização idempotente, sem remontar deltas.
    if (type === 'message_start' || type === 'message_update' || type === 'message_end' || type === 'turn_end') {
      const msg = (ev as { message?: { role?: string; content?: unknown; timestamp?: number; usage?: Usage } }).message
      if (!msg?.role) return
      if (msg.role !== 'user' && msg.role !== 'assistant') return

      const content: ContentBlock[] = Array.isArray(msg.content)
        ? (msg.content as ContentBlock[])
        : typeof msg.content === 'string'
          ? [{ type: 'text', text: msg.content }]
          : []

      const key = keyOf(msg.role, msg.timestamp)
      const finished = type === 'message_end' || type === 'turn_end' || msg.role === 'user'

      set((st) => {
        const idx = st.messages.findIndex((m) => m.key === key)
        const next: UiMessage = {
          key,
          role: msg.role as 'user' | 'assistant',
          content,
          usage: msg.usage ?? (idx >= 0 ? st.messages[idx].usage : undefined),
          timestamp: msg.timestamp ?? Date.now(),
          streaming: !finished
        }
        const messages = idx >= 0
          ? st.messages.map((m, i) => (i === idx ? next : m))
          : [...st.messages, next]

        // Custo/tokens só consolidam em turn_end, para não contar duas vezes.
        let totals = st.totals
        if (type === 'turn_end' && msg.usage) {
          totals = {
            tokens: st.totals.tokens + (msg.usage.totalTokens ?? 0),
            cost: st.totals.cost + (msg.usage.cost?.total ?? 0)
          }
        }
        return { messages, totals }
      })
      return
    }

    // ---- execução de ferramentas ------------------------------------------
    if (type === 'tool_execution_start') {
      const e = ev as unknown as { toolCallId: string; toolName: string; args: Record<string, unknown> }
      set((st) => ({
        tools: {
          ...st.tools,
          [e.toolCallId]: { id: e.toolCallId, name: e.toolName, args: e.args ?? {}, status: 'running', text: '' }
        }
      }))
      return
    }

    if (type === 'tool_execution_update') {
      const e = ev as unknown as { toolCallId: string; partialResult?: ToolResult }
      set((st) => {
        const cur = st.tools[e.toolCallId]
        if (!cur) return {}
        return { tools: { ...st.tools, [e.toolCallId]: { ...cur, text: textOf(e.partialResult) || cur.text } } }
      })
      return
    }

    if (type === 'tool_execution_end') {
      const e = ev as unknown as { toolCallId: string; toolName: string; result: ToolResult; isError?: boolean }
      set((st) => {
        const cur = st.tools[e.toolCallId]
        const d = e.result?.details
        return {
          tools: {
            ...st.tools,
            [e.toolCallId]: {
              id: e.toolCallId,
              name: e.toolName ?? cur?.name ?? 'tool',
              args: cur?.args ?? {},
              status: e.isError || e.result?.isError ? 'error' : 'ok',
              text: textOf(e.result),
              durationMs: d?.durationMs,
              stderr: d?.stderr,
              kernelRestarted: d?.kernelRestarted
            }
          }
        }
      })
      return
    }

    // ---- ciclo de vida e sinais -------------------------------------------
    switch (type) {
      case 'agent_start':
        set((st) => ({ state: st.state ? { ...st.state, isStreaming: true } : st.state }))
        break
      case 'agent_end':
        set((st) => ({
          state: st.state ? { ...st.state, isStreaming: false } : st.state,
          messages: st.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
        }))
        break
      case 'session_action_update': {
        const a = (ev as { actions?: AgentState['sessionActions'] }).actions
        set((st) => ({ state: st.state && a ? { ...st.state, sessionActions: a } : st.state }))
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
  }
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

export async function sendPrompt(message: string, images?: { data: string; mimeType: string }[]): Promise<void> {
  const st = useAgent.getState()
  const streaming = st.state?.isStreaming
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
