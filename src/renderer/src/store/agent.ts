/*
  Porta de entrada do store — barril.

  O arquivo tinha 1037 linhas e oito responsabilidades (achado ALTO 2 de
  `docs/auditoria/abstracao.md`). O conteúdo foi fatiado por domínio nos módulos
  vizinhos; aqui ficam apenas as reexportações, com os MESMOS nomes de antes,
  para que nenhum componente ou hook precise trocar de import.

  A lista é explícita, e não `export *`, porque o barril é a superfície pública
  do store: ajudante interno de uma fatia (como o `bridge()` do `rpc.ts`) não
  vaza para o resto do app por descuido.

  Mapa das fatias:

  - `agentStore.ts` — estado zustand, `ingest` e a sincronia de estado/contexto.
  - `rpc.ts`        — transporte (`rpcCall`, `rpc`).
  - `catalog.ts`    — modelos, comandos, sessões, árvore, pastas.
  - `turn.ts`       — prompt, abortar e ajustes do turno.
  - `schedules.ts`  — agendamentos e heartbeat.
  - `session.ts`    — abrir, estacionar, reiniciar ponte, excluir conversa.
  - `titles.ts`     — nome da conversa (automático e em lote).
  - `observe.ts`    — acompanhar a sessão de outro agente.
  - `transcript.ts` — redutor puro de eventos (já existia).
*/

export { useAgent, refreshContext, refreshState, waitForState } from './agentStore'
export type { ConfirmRequest, CommandInfo, Observed, ParkedRun } from './agentStore'
export type { UiMessage, ToolExec } from './agentStore'

export { rpc, rpcCall } from './rpc'
export type { RpcOutcome } from './rpc'

export {
  refreshModels, refreshCommands, refreshSessions, refreshTree, refreshFolders, mutateFolders
} from './catalog'

export {
  sendPrompt, abortTurn, setSteeringMode, setFollowUpMode, setModel, setThinking, compactNow
} from './turn'

export {
  listSchedules, addSchedule, cancelSchedule, getHeartbeat, setHeartbeat, updateHeartbeat
} from './schedules'

export { newSession, openSession, deleteSession } from './session'

export { generateTitleFor, generateTitlesFor, maybeGenerateTitle } from './titles'

export { observeSession, unobserveSession } from './observe'
