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

/**
 * Ocupação atual da janela de contexto, calculada pelo próprio agente.
 *
 * Não confundir com o consumo acumulado da sessão (`Usage`/`totals`): aqui o
 * número é o `totalTokens` da ÚLTIMA resposta do assistente, que é o tamanho
 * real do prompt no momento — sobe e desce. O agente aplica a mesma conta em
 * `calculateContextTokens` (core/compaction/compaction.js).
 */
export interface ContextUsage {
  /**
   * Tokens estimados na janela. `null` logo depois de compactar, enquanto não
   * houver resposta nova: o agente prefere admitir que não sabe a devolver o
   * número pré-compactação, que estaria errado.
   */
  tokens: number | null
  contextWindow: number
  /** Percentual da janela; `null` quando `tokens` é desconhecido. */
  percent: number | null
}

/** Resposta de `get_session_stats`. */
export interface SessionStats {
  sessionFile?: string
  sessionId: string
  userMessages: number
  assistantMessages: number
  toolCalls: number
  toolResults: number
  totalMessages: number
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  cost: number
  contextUsage?: ContextUsage
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

export type QueueMode = 'all' | 'one-at-a-time'

/** Como uma mensagem entra quando o agente está ocupado. */
export type DeliveryBehavior = 'steer' | 'followUp'

/**
 * Fila de mensagens da sessão.
 *
 * `steering` e `followUps` são os TEXTOS já enfileirados — e já expandidos pelo
 * agente (skills e templates resolvidos), então não são o que a pessoa digitou.
 * Estavam tipados como `unknown[]` aqui, o que escondia que dá para exibi-los.
 *
 * Não há comando RPC para remover ou reordenar item: dá para enfileirar e ler.
 */
export interface SessionActions {
  /** Conta ações, não mensagens: não derive de `steering.length + followUps.length`. */
  queuedCount: number
  steering: readonly string[]
  followUps: readonly string[]
  /** O que está em curso agora. Ausente quando o agente está ocioso. */
  active?: {
    kind: 'turn' | 'session_command'
    phase: 'preparing' | 'committing' | 'running'
    label?: string
  }
}

// ------------------------------------------------- agendamentos e heartbeats

export type AgentCronJobStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type AgentCronScheduleKind = 'once' | 'cron' | 'interval'
export type AgentCronJobSource = 'cron' | 'heartbeat' | 'rlm_heartbeat'

/** `steer` interrompe o turno em andamento; `follow_up` espera terminar. */
export type AgentHeartbeatDeliveryMode = 'steer' | 'follow_up'

export interface AgentCronSchedule {
  kind: AgentCronScheduleKind
  expression: string
  intervalMs?: number
}

/**
 * Prompt agendado. Serve tanto para agendamento comum quanto para heartbeat —
 * o que os separa é o `source`.
 *
 * `list_schedules` é filtrado por sessão no servidor: são os jobs da conversa
 * aberta, não uma visão global.
 */
export interface AgentCronJob {
  id: string
  status: AgentCronJobStatus
  source?: AgentCronJobSource
  deliveryMode?: AgentHeartbeatDeliveryMode
  activeSessionId: string
  sessionId: string
  sessionFile: string
  cwd: string
  label?: string
  prompt: string
  schedule: AgentCronSchedule
  createdAt: string
  updatedAt: string
  nextRunAt?: string
  lastRunAt?: string
  lastSkippedAt?: string
  lastError?: string
  runCount: number
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
  steeringMode: QueueMode
  followUpMode: QueueMode
  sessionId: string
  /** Nome de exibição definido via `set_session_name`; ausente se não houver. */
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  sessionActions: SessionActions
  goal: GoalState
}

/**
 * Eventos emitidos pelo agente em stdout que este cliente conhece.
 *
 * União fechada de propósito: com um membro coringa no fim, `ev.type === 'x'`
 * continuava aceitando o coringa e todo campo virava `unknown` — a união
 * existia mas não dava narrowing, e o renderer compensava com `as unknown as`.
 */
export type KnownAgentEvent =
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

/**
 * Evento que o agente emite e este cliente ainda não mapeou.
 *
 * Existe para que versão nova do prime-agent não quebre o app: o evento passa
 * pelo reducer sem casar com nada e é ignorado.
 */
export interface UnknownAgentEvent {
  type: string
  [k: string]: unknown
}

export type AgentEvent = KnownAgentEvent | UnknownAgentEvent

export type AgentEventOf<K extends KnownAgentEvent['type']> = Extract<KnownAgentEvent, { type: K }>

/**
 * Guarda de evento conhecido. Substitui os `as unknown as` do renderer: aqui o
 * compilador confere o nome do campo contra o protocolo, o cast não conferia.
 */
export function isAgentEvent<K extends KnownAgentEvent['type']>(
  ev: AgentEvent,
  type: K
): ev is AgentEventOf<K> {
  return ev.type === type
}

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
  /**
   * A conversa tem nome de verdade, gravado no `session_info`.
   *
   * Existe porque `title` não distingue: ele é `nome || primeiro prompt`, e o
   * renderer não tinha como saber se estava exibindo um nome ou o texto cru da
   * primeira mensagem. Sem isso não há como oferecer "gerar título" só para
   * quem precisa.
   */
  named: boolean
  messageCount: number
  sizeBytes: number
}

export type BridgeStatus = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

// ------------------------------------------------------------------ árvore RLM

export interface AgentNode {
  activeSessionId: string
  sessionId: string
  sessionFile: string
  /** Nome dado no spawn (`rlm(..., name=...)`). Vazio para o root. */
  name: string
  kind: 'root' | 'subagent'
  depth: number
  parentActiveSessionId?: string
  rlmChildId?: string
  /** Código Python que originou o subagente, reportado pelo daemon. */
  spawnCode?: string
  status: 'working' | 'idle' | 'done'
  taskState: string
  replied: boolean
  hasRunningChildren: boolean
  messageCount: number
  firstMessage: string
  cwd: string
  modelName: string
  lastActivityAt: string
  /**
   * Gasto próprio deste nó — não soma os filhos. `undefined` quando o daemon
   * não relata nada (sessão sem uso ainda, ou versão do prime-agent sem esse
   * campo em `list --json`): trate ausência como "sem dado", não como zero.
   */
  usage?: { inputTokens: number; outputTokens: number; cost: number }
  children: AgentNode[]
}

export interface AgentTreeSnapshot {
  roots: AgentNode[]
  total: number
  subagents: number
  at: number
}

// ----------------------------------------------------------------- pastas

export interface Folder {
  id: string
  name: string
  order: number
}

export interface FolderState {
  folders: Folder[]
  /** sessionId -> folderId */
  assignments: Record<string, string>
  /** chave de grupo -> colapsado */
  collapsed: Record<string, boolean>
  /** sessionId -> fixada no topo */
  pinned?: Record<string, boolean>
  /** sessionId -> arquivada (some da lista até habilitar exibição) */
  archived?: Record<string, boolean>
  /** sessionId -> título dado pelo usuário na GUI */
  titles?: Record<string, string>
}

// ----------------------------------------------------------------- arquivos

export interface DirEntry {
  name: string
  /** Caminho relativo à raiz do workspace. */
  path: string
  isDir: boolean
  size: number
}

// ------------------------------------------------------------------ uso

export interface UsageStats {
  sessions: number
  messages: number
  /** Soma de `totalTokens`, incluindo cache — igual ao que o agente reporta. */
  tokens: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  favoriteModel: string
  /** Hora do dia com mais mensagens; -1 quando não há dados. */
  peakHour: number
  days: { day: string; count: number }[]
}

// ----------------------------------------------------------------- ambiente

/**
 * Estado do ambiente do prime-agent: binário instalado e credencial válida.
 *
 * Mora aqui, e não no main, porque é payload de `onboarding:check` e do canal
 * `onboarding:env` — dois assinantes no renderer liam cópias próprias e nada
 * garantia que continuassem iguais à origem.
 */
export interface EnvStatus {
  agent: { installed: boolean; path: string | null; version: string | null }
  auth: { ok: boolean; providers: string[]; envKeys: string[] }
}

/** Resposta de `updates:check`. */
export interface UpdateCheck {
  current: string | null
  latest: string | null
  available: boolean
  /** Por que não checou. Não é erro: é estado esperado. */
  skipped?: 'offline' | 'disabled' | 'unknown-version'
  error?: string
}

// ---------------------------------------------------------------------- ssh

export interface SshConnection {
  id: string
  name: string
  host: string
  port?: number
  identity?: string
  remotePath?: string
}

/** Onde o agente executa. */
export interface ExecutionInfo {
  kind: 'local' | 'ssh'
  target?: string
}

// --------------------------------------------------------------------- fala

export interface SpeechModel {
  id: string
  label: string
  /** Tamanho aproximado, para a pessoa decidir antes de baixar. */
  bytes: number
  present: boolean
}

export interface SpeechStatus {
  /** Compilado e com pelo menos um modelo: dá para transcrever. */
  ready: boolean
  dir: string
  /** Caminho do `whisper-server`, quando já compilado. */
  server: string | null
  models: SpeechModel[]
  /** Ferramentas de build ausentes. Vazio = dá para compilar. */
  missing: string[]
}

// ---------------------------------------------------------------------- git

export interface GitBranchInfo {
  name: string
  current: boolean
  /** Ramo remoto que ela acompanha, quando existe. */
  upstream?: string
}

export interface GitChange {
  /** Caminho relativo à raiz do repositório. */
  path: string
  /** Código de duas letras do `git status --porcelain` (ex.: ` M`, `A `, `??`). */
  status: string
  added: number
  removed: number
}

// ------------------------------------------------------------- fronteira IPC

/**
 * Envelope de resposta do processo principal.
 *
 * Todo handler devolve `{ ok, ...dados, error? }` em vez de lançar (ver
 * `lib/ipc.ts`). Escrito como união discriminada por `ok`: assim `if (!r.ok)`
 * é narrowing de verdade e o campo de dado só existe no ramo bem-sucedido —
 * era isso que faltava para o renderer parar de afirmar tipo com `as`.
 */
export type Ok<T> = { ok: true } & T
export type Err = { ok: false; error?: string }
export type Envelope<T = Record<never, never>> = Ok<T> | Err

/** Resposta de `app:info`. Fora do envelope: o handler devolve o objeto cru. */
export interface AppInfo {
  version: string
  home: string
  platform: string
  userName: string
}

/**
 * Arquivo escolhido no seletor de anexo.
 *
 * Só imagem sobe embutida (`data`/`mimeType`); qualquer outro formato volta
 * apenas como caminho, porque o RPC do prime-agent aceita só imagem.
 */
export type PickedAttachment =
  | { path: string; isImage: true; data: string; mimeType: string }
  | { path: string; isImage: false }

/** Conversa que segue executando numa ponte estacionada, fora da tela. */
export interface ParkedRun {
  id: string
  cwd: string
  running: boolean
  sessionId?: string
  sessionPath?: string
}

/** Saída do processo do agente, como o main a reporta. */
export interface AgentExitInfo {
  code: number | null
  signal?: NodeJS.Signals | number | null
  stderr?: string
  /** `true` quando fomos nós que pedimos a parada. */
  expected?: boolean
}

/**
 * Evento do agente como ele chega ao renderer.
 *
 * O main carimba a ponte de origem, e a sessão observada vem embrulhada
 * (`observed_session_event`) para não se confundir com a conversa da tela.
 */
export type BridgeAgentEvent = AgentEvent & {
  bridgeId?: string
  activeSessionId?: string
  event?: AgentEvent
  error?: string
}

/** Resultado de `ssh:test`. */
export interface SshTestResult {
  ok: boolean
  message: string
}

/**
 * Canal de evento -> payload que ele carrega.
 *
 * Fonte única: a allowlist de runtime do preload é derivada daqui, então não há
 * como um canal existir num lugar e faltar no outro.
 */
export interface IpcEvents {
  'agent:event': BridgeAgentEvent
  'agent:response': RpcResponse
  'agent:stderr': string
  'agent:fatal': string
  'agent:exit': AgentExitInfo
  'agents:tree': AgentTreeSnapshot
  'agents:tree-error': string
  'onboarding:output': string
  'onboarding:env': EnvStatus
  'bridge:parked': ParkedRun[]
  'bridge:run-ended': { id: string; sessionId?: string; sessionPath?: string }
  'terminal:data': { id: string; data: string }
  'terminal:exit': { id: string; exitCode: number; signal?: number }
}

export type IpcChannel = keyof IpcEvents

export const IPC_CHANNELS: readonly IpcChannel[] = [
  'agent:event', 'agent:response', 'agent:stderr', 'agent:fatal', 'agent:exit',
  'agents:tree', 'agents:tree-error', 'onboarding:output', 'onboarding:env',
  'bridge:parked', 'bridge:run-ended',
  'terminal:data', 'terminal:exit'
]
