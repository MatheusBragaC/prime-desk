import { create } from 'zustand'
import type {
  AgentEvent, AgentMessage, AgentState, ModelInfo, SessionSummary,
  BridgeStatus, AgentTreeSnapshot, FolderState,
  ContextUsage, SessionStats, ParkedRun, ExecutionInfo
} from '../../../shared/protocol'
import { isAgentEvent } from '../../../shared/protocol'
import {
  applyEvent, emptyTranscript, hydrate, type Totals, type ToolExec, type Transcript, type UiMessage
} from './transcript'
import { rpc } from './rpc'

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

// Payload do canal `bridge:parked`: é protocolo, não estado inventado aqui.
export type { ParkedRun }

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
  /** Ocupação da janela, vinda do agente. `null` enquanto não foi consultada. */
  context: ContextUsage | null
  cwd: string
  /**
   * Onde o agente executa: máquina local ou destino SSH.
   *
   * Vive aqui porque três lugares liam o mesmo fato por caminhos diferentes — o
   * chip do composer por IPC num efeito com dependência de `cwd`, e
   * `syncCwdToSession` por IPC de novo. Quem troca de destino é sempre um start
   * de ponte, então o valor é escrito a partir da resposta do main e todo o
   * resto apenas observa.
   */
  execution: ExecutionInfo
  platform: string
  loadingSession: boolean
  compacting: boolean
  retry: { attempt: number; max: number; message: string } | null
  tree: AgentTreeSnapshot | null
  treeError: string | null
  folders: FolderState
  observed: Record<string, Observed>
  notice: { kind: 'error' | 'info'; text: string; at: number } | null
  confirm: ConfirmRequest | null
  /** Ponte cujos eventos alimentam a tela. As demais são descartadas. */
  activeBridgeId: string | null
  parkedRuns: ParkedRun[]
  /**
   * Pedido para abrir um comando numa aba do terminal embutido.
   *
   * Existe porque quem pede (o menu da conta, no rodapé da sidebar) está longe
   * de quem atende (o painel de terminal, do outro lado da árvore). Passar
   * callback por toda a hierarquia para isso seria pior que um recado no store.
   */
  terminalRequest: { command: string; title: string } | null
  /**
   * Pedido para abrir um painel do dock.
   *
   * Mesmo motivo do `terminalRequest`: quem pede está longe de quem decide. O
   * popover da fila mostra relatórios de subagentes e quer levar à árvore, mas
   * o dock é estado do App.
   */
  dockRequest: string | null
  /**
   * Documento aberto no painel — plano, relatório, qualquer resposta longa e
   * estruturada que o card "Abrir documento" trouxe para cá.
   *
   * `id` identifica o bloco de origem (`${chave da mensagem}:${índice do
   * bloco}`), para o card poder atualizar o texto ao vivo enquanto o mesmo
   * documento ainda está sendo transmitido e o painel já está aberto nele —
   * sem isso, abrir cedo demais mostraria a resposta parando de crescer.
   */
  document: { id: string; title: string; text: string } | null
  /**
   * Contador de `heartbeats_changed`.
   *
   * O evento não carrega dado: quem mostra heartbeat precisa saber apenas que
   * a lista mudou e recarregar. Um contador no store deixa o painel reagir sem
   * abrir um segundo assinante de `agent:event` — o único assinante, em
   * `lib/useBridge.ts`, é quem aplica a guarda de `bridgeId`.
   */
  heartbeatsRev: number

  setStatus: (s: BridgeStatus) => void
  setCwd: (c: string) => void
  setExecution: (e: ExecutionInfo) => void
  setActiveBridge: (id: string | null) => void
  setParkedRuns: (runs: ParkedRun[]) => void
  setPlatform: (p: string) => void
  setLoadingSession: (v: boolean) => void
  ingest: (ev: AgentEvent) => void
  loadHistory: (messages: AgentMessage[]) => void
  applyStderr: (chunk: string) => void
  setFatal: (m: string | null) => void
  setState: (s: AgentState) => void
  setContext: (c: ContextUsage | null) => void
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
  requestTerminal: (command: string, title: string) => void
  clearTerminalRequest: () => void
  requestDock: (kind: string) => void
  clearDockRequest: () => void
  openDocument: (doc: { id: string; title: string; text: string }) => void
  /** Só atualiza se `id` já é o documento aberto — chamado a cada quadro de streaming. */
  updateDocumentIfOpen: (id: string, text: string) => void
  closeDocument: () => void
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
  context: null,
  cwd: '',
  execution: { kind: 'local' },
  platform: '',
  loadingSession: false,
  compacting: false,
  retry: null,
  tree: null,
  treeError: null,
  folders: { folders: [], assignments: {}, collapsed: {} },
  observed: {},
  notice: null,
  confirm: null,
  activeBridgeId: null,
  parkedRuns: [],
  terminalRequest: null,
  dockRequest: null,
  document: null,
  heartbeatsRev: 0,

  setStatus: (s) => set({ status: s }),
  setCwd: (c) => set({ cwd: c }),
  setExecution: (execution) => set({ execution }),
  setActiveBridge: (activeBridgeId) => set({ activeBridgeId }),
  setParkedRuns: (parkedRuns) => set({ parkedRuns }),
  setPlatform: (platform) => set({ platform }),
  setLoadingSession: (loadingSession) => set({ loadingSession }),
  setFatal: (m) => set({ fatal: m, status: m ? 'error' : get().status }),
  setState: (s) => set({ state: s }),
  setContext: (context) => set({ context }),
  requestTerminal: (command, title) => set({ terminalRequest: { command, title } }),
  clearTerminalRequest: () => set({ terminalRequest: null }),
  requestDock: (dockRequest) => set({ dockRequest }),
  clearDockRequest: () => set({ dockRequest: null }),
  openDocument: (document) => set({ document }),
  updateDocumentIfOpen: (id, text) =>
    set((s) => (s.document?.id === id ? { document: { ...s.document, text } } : {})),
  closeDocument: () => set({ document: null }),
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

  reset: () => set({ ...emptyTranscript(), context: null, retry: null }),

  loadHistory: (messages) => set(hydrate(messages)),

  ingest: (ev) => {
    const st = get()
    const before: Transcript = { messages: st.messages, tools: st.tools, totals: st.totals }
    const after = applyEvent(before, ev)
    if (after !== before) set(after)

    /*
      Cadeia de guardas em vez de `switch (ev.type)`: `AgentEvent` inclui o
      evento ainda não mapeado (`type: string`), e num `switch` ele acompanha
      todo `case` — o campo lido voltaria a ser `unknown`. Evento desconhecido
      não casa com nenhuma guarda e é ignorado, como antes.
    */
    if (isAgentEvent(ev, 'agent_start')) {
      set((s) => ({ state: s.state ? { ...s.state, isStreaming: true } : s.state }))
    } else if (isAgentEvent(ev, 'agent_end')) {
      set((s) => ({ state: s.state ? { ...s.state, isStreaming: false } : s.state }))
      // A ocupação só muda quando o turno fecha; consultar durante o stream
      // seria pedir o mesmo número várias vezes.
      void refreshContext()
    } else if (isAgentEvent(ev, 'session_action_update')) {
      const a = ev.actions
      set((s) => ({ state: s.state && a ? { ...s.state, sessionActions: a } : s.state }))
    } else if (isAgentEvent(ev, 'compaction_start')) {
      set({ compacting: true })
    } else if (isAgentEvent(ev, 'compaction_end')) {
      set({ compacting: false })
      // Aqui o agente devolve `tokens: null` de propósito, até a próxima
      // resposta. A UI mostra "desconhecido" em vez do número velho.
      void refreshContext()
    } else if (isAgentEvent(ev, 'auto_retry_start')) {
      set({ retry: { attempt: ev.attempt, max: ev.maxAttempts, message: ev.errorMessage } })
    } else if (isAgentEvent(ev, 'auto_retry_end')) {
      set({ retry: null })
    } else if (isAgentEvent(ev, 'heartbeats_changed')) {
      set((s) => ({ heartbeatsRev: s.heartbeatsRev + 1 }))
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

/*
  ------------------------------------------------------- sincronia com o agente

  `refreshContext` e companhia moram aqui, e não numa fatia própria, porque o
  `ingest` acima chama `refreshContext` quando o turno fecha: separar criaria
  um ciclo de importação entre o store e essa fatia sem ganho nenhum.
*/

/**
 * Ocupação da janela de contexto.
 *
 * Vem de `get_session_stats`, não de soma local: `totals.tokens` é consumo
 * acumulado (recontando `cacheRead` a cada turno) e nunca desce, então dividir
 * aquilo pela janela dava um indicador que saturava em 100% e não voltava nem
 * depois de compactar. Aqui o número é o do próprio agente.
 */
export async function refreshContext(): Promise<void> {
  const data = await rpc<SessionStats>('get_session_stats')
  useAgent.getState().setContext(data?.contextUsage ?? null)
}

export async function refreshState(): Promise<void> {
  const [state] = await Promise.all([rpc<AgentState>('get_state'), refreshContext()])
  if (state) useAgent.getState().setState(state)
}

/**
 * Espera o worker do daemon aceitar comandos.
 *
 * O `prime-agent --mode rpc` sobe antes de o worker estar pronto: os primeiros
 * `get_state` voltam vazios por alguns segundos. Sem esta espera, quem sobe a
 * ponte conclui que ela falhou.
 *
 * Estava copiada em três lugares (boot, troca de destino de execução e troca de
 * diretório), sempre com os mesmos 30 × 700ms escritos à mão.
 *
 * @returns `true` se o estado chegou; `false` se estourou o tempo.
 */
export async function waitForState(tries = 30, delayMs = 700): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    await new Promise((res) => setTimeout(res, delayMs))
    await refreshState()
    if (useAgent.getState().state) return true
  }
  return false
}
