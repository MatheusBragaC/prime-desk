/**
 * Tipos do protocolo RPC do prime-agent.
 * Derivados por inspeção de docs/rpc.md + smoke test real (ver docs/MAPEAMENTO.md).
 */

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const THINKING_LEVELS: ThinkingLevel[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
]

export interface ModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ModelInfo {
  id: string
  name: string
  api: string
  provider: string
  reasoning?: boolean
  input?: string[]
  cost?: ModelCost
  contextWindow?: number
  maxTokens?: number
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

/** Blocos de conteúdo de uma mensagem. */
export type ContentBlock =
  | { type: 'text'; text: string; index?: number }
  | { type: 'thinking'; thinking: string; thinkingSignature?: string; index?: number }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown>; partialJson?: string; index?: number }
  | { type: 'image'; data: string; mimeType: string }

export interface AgentMessage {
  role: 'user' | 'assistant' | 'toolResult' | 'custom' | 'bashExecution'
  content: ContentBlock[] | string
  timestamp?: number
  model?: string
  provider?: string
  usage?: Usage
  stopReason?: string
}

export interface ToolResult {
  content?: { type: string; text?: string }[]
  details?: {
    durationMs?: number
    status?: string
    stdout?: string
    stderr?: string
    kernelRestarted?: boolean
  }
  isError?: boolean
}

export interface SessionActions {
  queuedCount: number
  steering: unknown[]
  followUps: unknown[]
}

export interface GoalState {
  active: boolean
  status: string
  tokensUsed: number
  timeUsedSeconds: number
  continuationsUsed: number
  objective?: string
  tokenBudget?: number
}

export interface AgentState {
  model: ModelInfo
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: string
  followUpMode: string
  sessionId: string
  autoCompactionEnabled: boolean
  messageCount: number
  sessionActions: SessionActions
  goal: GoalState
}

/** Eventos emitidos pelo agente em stdout. */
export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessage }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'message_update'; message: AgentMessage; assistantMessageEvent: { type: string; contentIndex?: number; delta?: string } }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: Record<string, unknown>; partialResult?: ToolResult }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: ToolResult; isError?: boolean }
  | { type: 'session_action_update'; actions: SessionActions }
  | { type: 'compaction_start'; reason: string }
  | { type: 'compaction_end'; reason: string; aborted: boolean }
  | { type: 'auto_retry_start'; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string }
  | { type: 'extension_error'; message?: string }
  | { type: string; [k: string]: unknown }

export interface RpcResponse<T = unknown> {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: T
  error?: string
}

/** Metadados de sessão salva, lidos direto do JSONL. */
export interface SessionSummary {
  id: string
  path: string
  cwd: string
  createdAt: string
  updatedAt: string
  title: string
  messageCount: number
  sizeBytes: number
}

export type BridgeStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
