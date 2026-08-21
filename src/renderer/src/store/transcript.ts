import type { AgentEvent, AgentMessage, ContentBlock, ToolResult, Usage } from '../../../shared/protocol'

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

export interface Totals {
  tokens: number
  cost: number
}

/**
 * Estado de uma transcrição.
 *
 * O mesmo reducer serve à sessão própria e às sessões observadas via `observe`,
 * porque os eventos internos de `observed_session_event` têm exatamente o mesmo
 * formato dos eventos da própria sessão (confirmado empiricamente).
 */
export interface Transcript {
  messages: UiMessage[]
  tools: Record<string, ToolExec>
  totals: Totals
}

export function emptyTranscript(): Transcript {
  return { messages: [], tools: {}, totals: { tokens: 0, cost: 0 } }
}

function textOf(result?: ToolResult): string {
  if (!result) return ''
  const joined = (result.content ?? []).map((c) => c.text ?? '').join('')
  return joined || result.details?.stdout || ''
}

/** Identidade estável: role + timestamp emitido pelo agente. */
function keyOf(role: string, timestamp?: number): string {
  return `${role}:${timestamp ?? 0}`
}

function blocksOf(content: unknown): ContentBlock[] {
  if (Array.isArray(content)) return content as ContentBlock[]
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return []
}

/**
 * Registra o resultado de uma ferramenta a partir de uma mensagem `toolResult`.
 *
 * Necessário porque histórico (get_messages, observe) não reemite os eventos
 * `tool_execution_*`: o resultado chega como mensagem. Sem isto, os cards de
 * ferramenta de uma sessão reaberta ficariam presos em "preparando".
 */
function applyToolResultMessage(tools: Record<string, ToolExec>, msg: AgentMessage): Record<string, ToolExec> {
  const m = msg as AgentMessage & {
    toolCallId?: string
    toolName?: string
    details?: ToolExec extends never ? never : Record<string, unknown>
    isError?: boolean
  }
  const id = m.toolCallId
  if (!id) return tools
  const details = (m.details ?? {}) as {
    durationMs?: number
    stderr?: string
    kernelRestarted?: boolean
  }
  const prev = tools[id]
  return {
    ...tools,
    [id]: {
      id,
      name: m.toolName ?? prev?.name ?? 'tool',
      args: prev?.args ?? {},
      status: m.isError ? 'error' : 'ok',
      text: textOf(m as unknown as ToolResult),
      durationMs: details.durationMs,
      stderr: details.stderr,
      kernelRestarted: details.kernelRestarted
    }
  }
}

function upsertMessage(t: Transcript, msg: AgentMessage, finished: boolean, countUsage: boolean): Transcript {
  const role = msg.role
  if (role !== 'user' && role !== 'assistant') return t

  const key = keyOf(role, msg.timestamp)
  const idx = t.messages.findIndex((m) => m.key === key)
  const next: UiMessage = {
    key,
    role,
    content: blocksOf(msg.content),
    usage: msg.usage ?? (idx >= 0 ? t.messages[idx].usage : undefined),
    timestamp: msg.timestamp ?? Date.now(),
    streaming: !(finished || role === 'user')
  }

  const messages = idx >= 0 ? t.messages.map((m, i) => (i === idx ? next : m)) : [...t.messages, next]

  const totals =
    countUsage && msg.usage
      ? {
          tokens: t.totals.tokens + (msg.usage.totalTokens ?? 0),
          cost: t.totals.cost + (msg.usage.cost?.total ?? 0)
        }
      : t.totals

  return { ...t, messages, totals }
}

/** Aplica um evento. Retorna o mesmo objeto se nada mudou. */
export function applyEvent(t: Transcript, ev: AgentEvent): Transcript {
  const type = ev.type

  if (type === 'message_start' || type === 'message_update' || type === 'message_end' || type === 'turn_end') {
    const msg = (ev as { message?: AgentMessage }).message
    if (!msg?.role) return t
    if (msg.role === 'toolResult') {
      return { ...t, tools: applyToolResultMessage(t.tools, msg) }
    }
    const finished = type === 'message_end' || type === 'turn_end'
    // Custo consolida só em turn_end, para não contar o mesmo turno duas vezes.
    return upsertMessage(t, msg, finished, type === 'turn_end')
  }

  if (type === 'tool_execution_start') {
    const e = ev as unknown as { toolCallId: string; toolName: string; args: Record<string, unknown> }
    return {
      ...t,
      tools: {
        ...t.tools,
        [e.toolCallId]: { id: e.toolCallId, name: e.toolName, args: e.args ?? {}, status: 'running', text: '' }
      }
    }
  }

  if (type === 'tool_execution_update') {
    const e = ev as unknown as { toolCallId: string; partialResult?: ToolResult }
    const cur = t.tools[e.toolCallId]
    if (!cur) return t
    const text = textOf(e.partialResult) || cur.text
    if (text === cur.text) return t
    return { ...t, tools: { ...t.tools, [e.toolCallId]: { ...cur, text } } }
  }

  if (type === 'tool_execution_end') {
    const e = ev as unknown as {
      toolCallId: string
      toolName: string
      result: ToolResult
      isError?: boolean
    }
    const cur = t.tools[e.toolCallId]
    const d = e.result?.details
    return {
      ...t,
      tools: {
        ...t.tools,
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
  }

  if (type === 'agent_end') {
    if (!t.messages.some((m) => m.streaming)) return t
    return { ...t, messages: t.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)) }
  }

  return t
}

/** Reconstrói uma transcrição a partir de um histórico de mensagens. */
export function hydrate(messages: AgentMessage[]): Transcript {
  let t = emptyTranscript()
  for (const msg of messages) {
    if (!msg?.role) continue
    if (msg.role === 'toolResult') {
      t = { ...t, tools: applyToolResultMessage(t.tools, msg) }
      continue
    }
    t = upsertMessage(t, msg, true, false)
  }
  return t
}
