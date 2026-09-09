import { isAgentEvent } from '../../../shared/protocol'
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
  /**
   * Quando a execução começou, em epoch ms.
   *
   * Só existe para chamada vista ao vivo: conversa carregada do disco não tem
   * evento de início, e inventar um faria uma chamada antiga parecer estar
   * rodando agora. `durationMs` cobre o caso terminado; este cobre o em curso,
   * que antes não tinha relógio nenhum — o card girava o mesmo spinner por dois
   * segundos ou por quarenta minutos.
   */
  startedAt?: number
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

  /*
    Argumentos da chamada vêm no bloco `toolCall` da mensagem do assistente; o
    `toolResult` traz só o resultado. Ao carregar uma conversa do disco não há
    evento `tool_execution_start` nenhum, então sem esta semeadura o card ficava
    sem o código executado — só com o nome da ferramenta e a saída.
  */
  let tools = t.tools
  for (const b of next.content) {
    if (b.type !== 'toolCall' || !b.id) continue
    const prev = tools[b.id]
    if (prev && Object.keys(prev.args).length > 0) continue
    const args = b.arguments ?? {}
    if (!prev && Object.keys(args).length === 0) continue
    tools = {
      ...tools,
      [b.id]: prev
        ? { ...prev, args }
        : { id: b.id, name: b.name, args, status: 'running', text: '' }
    }
  }

  const totals =
    countUsage && msg.usage
      ? {
          tokens: t.totals.tokens + (msg.usage.totalTokens ?? 0),
          cost: t.totals.cost + (msg.usage.cost?.total ?? 0)
        }
      : t.totals

  return { ...t, messages, tools, totals }
}

/**
 * Aplica um evento. Retorna o mesmo objeto se nada mudou.
 *
 * Evento fora do protocolo cai no fim e não muda nada: versão nova do agente
 * não pode quebrar a tela.
 */
export function applyEvent(t: Transcript, ev: AgentEvent): Transcript {
  if (
    isAgentEvent(ev, 'message_start') ||
    isAgentEvent(ev, 'message_update') ||
    isAgentEvent(ev, 'message_end') ||
    isAgentEvent(ev, 'turn_end')
  ) {
    const msg = ev.message
    if (!msg?.role) return t
    if (msg.role === 'toolResult') {
      return { ...t, tools: applyToolResultMessage(t.tools, msg) }
    }
    const finished = ev.type === 'message_end' || ev.type === 'turn_end'
    // Custo consolida só em turn_end, para não contar o mesmo turno duas vezes.
    return upsertMessage(t, msg, finished, ev.type === 'turn_end')
  }

  if (isAgentEvent(ev, 'tool_execution_start')) {
    return {
      ...t,
      tools: {
        ...t.tools,
        [ev.toolCallId]: {
          id: ev.toolCallId,
          name: ev.toolName,
          args: ev.args ?? {},
          status: 'running',
          text: '',
          startedAt: Date.now()
        }
      }
    }
  }

  if (isAgentEvent(ev, 'tool_execution_update')) {
    const cur = t.tools[ev.toolCallId]
    if (!cur) return t
    const text = textOf(ev.partialResult) || cur.text
    if (text === cur.text) return t
    return { ...t, tools: { ...t.tools, [ev.toolCallId]: { ...cur, text } } }
  }

  if (isAgentEvent(ev, 'tool_execution_end')) {
    const cur = t.tools[ev.toolCallId]
    const d = ev.result?.details
    return {
      ...t,
      tools: {
        ...t.tools,
        [ev.toolCallId]: {
          id: ev.toolCallId,
          name: ev.toolName ?? cur?.name ?? 'tool',
          args: cur?.args ?? {},
          status: ev.isError || ev.result?.isError ? 'error' : 'ok',
          text: textOf(ev.result),
          startedAt: cur?.startedAt,
          /*
            O agente informa a duração; quando não informa, e a chamada foi
            vista ao vivo, o relógio local serve. Sem isso uma chamada de
            quarenta minutos terminava sem deixar registro de quanto durou.
          */
          durationMs: d?.durationMs ?? (cur?.startedAt ? Date.now() - cur.startedAt : undefined),
          stderr: d?.stderr,
          kernelRestarted: d?.kernelRestarted
        }
      }
    }
  }

  if (isAgentEvent(ev, 'agent_end')) {
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
