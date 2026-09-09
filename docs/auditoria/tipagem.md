# Auditoria - Escopo 2: tipagem (renderer + contrato com o main)

Data: auditoria estatica de leitura. **Nenhum arquivo de codigo foi alterado.**
`npm run typecheck` passa no estado atual: todos os achados sao lacunas latentes
que casts e tipos inline mantem invisiveis para o compilador.

Estrutura deste relatorio:

1. **Parte 1 - contrato e stores** (`protocol.ts`, `preload/index.ts`,
   `global.d.ts`, `store/agent.ts`, `store/transcript.ts`, `lib/ipc.ts`):
   achados T1-T14, os estruturais.
2. **Parte 2 - props dos componentes A-N**.
3. **Parte 3 - props dos componentes O-W**.
4. **Contagem consolidada** e ordem de correcao sugerida.

## Achados ALTO, resumo executivo

| Origem | Achado |
|--------|--------|
| T1 | `preload/index.ts` nao anota nenhum retorno: `ipcRenderer.invoke` -> `Promise<any>` em toda a `PrimeApi` (preload:111). Raiz de ~25 casts `as X` no renderer. Provado com `tsc`. |
| T2 | `AgentEvent` (protocol.ts:200-217) tem membro coringa `{ type: string; [k: string]: unknown }` que destroi o narrowing da union. Provado com `tsc`. 6 `as unknown as` no renderer. |
| T3 | 6 tipos de payload do main reescritos a mao no renderer (`EnvStatus` em DUAS copias, `SshConnection`, `SpeechStatus`, `GitChange`, `Branch`/`GitBranchInfo`, `UpdateCheck`). |
| T14 | `on()` (preload:95-106) sem mapa canal->payload: canal e `string` com allowlist so em runtime, payload e `unknown`, 5 casts nos assinantes. |
| A2 | `AccountBadge.tsx:35,44,88,90` - `as EnvStatus` e `as typeof update` amarram contrato remoto a estado local. |
| A5 | `Composer.tsx:489,495` - `r.picked as [...]` com `p.data!`/`p.mimeType!` sobre `any`. |
| A7 | `FileViewer.tsx:52-60` - resposta de `readFile` consumida como `any` puro; alimenta `dangerouslySetInnerHTML` (:218) e o bloqueio de gravacao (:69). |
| B3 | `SshModal.tsx:28,46` - resultado de `ssh:test` sem contrato nomeado, materializado por `r as { ok; message }`. |
| B4 | `TerminalPanel.tsx:19-27,218` - `Tab` com `path?`/`command?` opcionais forca `tab.path as string`. |
| B2 | `Onboarding.tsx:88-89` - payload `unknown` do canal `onboarding:env` com cast direto, sem guarda. |

Os demais ALTO de Parte 2/3 (A1, A3, A4, A6, A8, B1) sao instancias de T3 e
estao detalhados la.

---

# Parte 1 - contrato e stores

Arquivos: `src/shared/protocol.ts`, `src/preload/index.ts`,
`src/renderer/src/global.d.ts`, `store/agent.ts`, `store/transcript.ts`, `lib/ipc.ts`.

## Sumario dos achados estruturais

| # | Achado | Severidade |
|---|--------|------------|
| T1 | Toda a bridge do preload devolve `Promise<any>`; ~25 casts `as X` no renderer | ALTO |
| T2 | `AgentEvent` tem membro coringa que destroi o narrowing da union | ALTO |
| T3 | Tipos de payload do main duplicados nos componentes (EnvStatus x2, SshConnection, SpeechStatus, GitChange, Branch) | ALTO |
| T4 | `rpcCall<T>(type: string)` - comando e resultado sem contrato | MEDIO |
| T5 | `dockRequest: string` no store e union `Dock` morando em `StatusBar.tsx` | MEDIO |
| T6 | Parametros `unknown` no preload (`saveFolders`, `saveSshConnections`) | MEDIO |
| T7 | `AgentMessage` sem o caso `toolResult` -> cast `as unknown as ToolResult` | MEDIO |
| T8 | Tipo conditional sem sentido em `transcript.ts:83` | MEDIO |
| T9 | Envelope IPC inconsistente (`app:info` sem `ok`) e sem tipo `Envelope<T>` | MEDIO |
| T10 | `platform: string` onde cabe union | BAIXO |
| T11 | Falta `readonly` no estado imutavel do store/transcript | BAIXO |
| T12 | `blocksOf` confia em `content as ContentBlock[]` sem validar | BAIXO |
| T13 | `UiMessage.role` reescreve um subconjunto de `AgentMessage['role']` | BAIXO |
| T14 | `on()` sem mapa canal->payload; 5 casts de payload `unknown` | ALTO |

---

## T1 - ALTO: a bridge inteira e `any`

`src/preload/index.ts` nao anota nenhum retorno. `ipcRenderer.invoke` devolve
`Promise<any>`, entao `PrimeApi` (preload/index.ts:111) propaga `any` para todo
o renderer.

Evidencia experimental (compilado com o `tsc` do projeto, arquivo temporario
fora de `src/`):

```ts
import type { PrimeApi } from 'src/preload/index'
export async function f(api: PrimeApi): Promise<number> {
  const r = await api.checkEnvironment()
  return r.qualquerCoisaQueNaoExiste * 2   // compila sem erro
}
```

O acesso a um campo inexistente compila. Consequencias observadas no codigo:

- casts de envelope espalhados: `store/agent.ts:297`, `:299`, `:361`, `:384`,
  `:392`, `:661`, `:662`, `:706`, `:744`, `:817`, `:820`, `:889`, `:911`, `:981`;
  `lib/useExecutionTarget.ts:37`, `:42`; `components/FilesPanel.tsx:43`, `:159`;
  `components/BranchPicker.tsx:49`; `components/AccountBadge.tsx:35`, `:44`, `:88`;
  `components/MicButton.tsx:76`; `components/Onboarding.tsx:67`;
  `components/DiffPanel.tsx:64`; `components/Welcome.tsx:19`.
- `lib/ipc.ts:18-19` assume `any` de proposito (`call: Promise<any>`,
  `pick: (res: any) => T`) e o comentario em `lib/ipc.ts:12-13` reconhece que
  "o preload devolve `any`". O cast do `pick` nao e checado contra nada.
- se o main renomear um campo do envelope (ex.: `entries` -> `items`), nada
  falha em `typecheck`; quebra em runtime.

Correcao concreta, em duas etapas que nao exigem tocar em nenhum chamador:

1. Em `src/shared/protocol.ts`, declarar o envelope e mover para la os tipos de
   payload hoje espalhados (ver T3):

```ts
export type Ok<T> = { ok: true } & T
export type Err = { ok: false; error?: string }
export type Envelope<T = Record<string, never>> = Ok<T> | Err
```

2. Em `src/preload/index.ts`, anotar cada metodo:

```ts
listFiles: (relPath: string): Promise<Envelope<{ entries: DirEntry[] }>> =>
  ipcRenderer.invoke('files:list', relPath),
checkEnvironment: (): Promise<Envelope<{ status: EnvStatus }>> =>
  ipcRenderer.invoke('onboarding:check'),
gitBranches: (): Promise<Envelope<{ branches: GitBranchInfo[]; dirty: boolean }>> =>
  ipcRenderer.invoke('git:branches'),
```

Com isso `if (!r.ok) return` passa a narrowing de verdade e cada `as X` da lista
acima e apagado sem substituto. `unwrap` (lib/ipc.ts:17) fica:

```ts
export async function unwrap<T, D>(
  call: Promise<Envelope<T>>,
  pick: (res: Ok<T>) => D,
  fallback: string
): Promise<D>
```

## T2 - ALTO: o membro coringa de `AgentEvent` mata a union discriminada

`src/shared/protocol.ts:200-217` declara 15 membros discriminados por `type` e,
no fim, `| { type: string; [k: string]: unknown }` (protocol.ts:217). Esse ultimo
membro faz `ev.type === 'tool_execution_start'` continuar aceitando o coringa,
e o acesso a qualquer campo vira `unknown`.

Evidencia experimental com o `tsc` do projeto:

```ts
if (ev.type === 'tool_execution_start') { return ev.toolName }
// error TS2322: Type 'unknown' is not assignable to type 'string'.
```

Ou seja: a union existe mas nao serve para narrowing. E por isso que o codigo
recorre a cast duplo justamente nos eventos que o protocolo JA declara:

- `store/transcript.ts:174` (`tool_execution_start`, declarado em protocol.ts:208)
- `store/transcript.ts:192` (`tool_execution_update`, protocol.ts:209)
- `store/transcript.ts:201-206` (`tool_execution_end`, protocol.ts:210)
- `store/transcript.ts:163` (`message`, protocol.ts:205-207)
- `store/agent.ts:220` (`session_action_update`, protocol.ts:211)
- `store/agent.ts:234` (`auto_retry_start`, protocol.ts:214)

Todo cast e `as unknown as`, que desliga qualquer checagem: se o protocolo
mudar `maxAttempts` para `attempts`, `agent.ts:235` compila e le `undefined`.

Correcao concreta em `src/shared/protocol.ts`:

```ts
/** Eventos que o cliente conhece. Union fechada: da narrowing. */
export type KnownAgentEvent =
  | { type: 'agent_start' }
  /* ... os 15 membros atuais, sem o coringa ... */

/** Evento novo do agente, ainda nao mapeado aqui. */
export interface UnknownAgentEvent { type: string; [k: string]: unknown }

export type AgentEvent = KnownAgentEvent | UnknownAgentEvent

export type AgentEventOf<K extends KnownAgentEvent['type']> =
  Extract<KnownAgentEvent, { type: K }>

/** Guarda unica: substitui todos os `as unknown as` do renderer. */
export function isAgentEvent<K extends KnownAgentEvent['type']>(
  ev: AgentEvent,
  type: K
): ev is AgentEventOf<K> {
  return ev.type === type
}
```

Uso em `store/transcript.ts:173`:

```ts
if (isAgentEvent(ev, 'tool_execution_start')) {
  // ev.toolCallId, ev.toolName, ev.args ja tipados, sem cast
}
```

E no `switch (ev.type)` de `store/agent.ts:209-243` o `default` deixa de ser
obrigatorio por acidente: com `KnownAgentEvent` fechado da para escrever
`default: { const _never: UnknownAgentEvent = ev; break }` e ganhar aviso quando
o protocolo crescer.

## T3 - ALTO: tipos de payload do main duplicados dentro dos componentes

Cinco tipos que descrevem a resposta de um handler do main foram reescritos a
mao no renderer, fora do `src/shared/protocol.ts`. Nenhum deles e importado do
main (correto: o renderer nao deve importar de `src/main`), mas a copia manual
nao tem nada que a mantenha em sincronia.

| Tipo | Definicao no main | Copia no renderer |
|------|-------------------|-------------------|
| `EnvStatus` | `src/main/onboarding.ts:17` | `components/AccountBadge.tsx:9` **e** `components/Onboarding.tsx:11` (duas copias identicas, nenhuma exportada) |
| `SshConnection` | `src/main/ssh.ts:78` | `components/Composer.tsx:18` (exportado de um componente e consumido por `lib/useExecutionTarget.ts:37`) |
| `SpeechStatus` / `SpeechModel` | `src/main/speech.ts:42` / `:27` | `components/MicButton.tsx:10` / `:9` |
| `GitChange` | `src/main/files.ts:315` | `components/DiffPanel.tsx:9` |
| `GitBranchInfo` | `src/main/files.ts:143` | `components/BranchPicker.tsx:7` como `Branch` (mesmo shape, outro nome) |
| `UpdateCheck` | `src/main/updates.ts:21` | `components/AccountBadge.tsx:31` inline (`{ current; latest; available }`), sem `skipped` nem `error` |

Agravante em `Composer.tsx:18`: `SshConnection` e um tipo de dominio exportado
por um componente de UI, e um hook (`lib/useExecutionTarget.ts`) importa dele.
Isso inverte a dependencia - o hook passa a depender do componente.

Correcao concreta: mover os seis para `src/shared/protocol.ts` (secoes novas
`// --- ambiente`, `// --- ssh`, `// --- fala`, `// --- git`), fazer
`src/main/*.ts` re-exportar de la (`export type { EnvStatus } from '../shared/protocol'`)
para o main nao duplicar, e trocar as declaracoes locais por import:

```ts
// components/AccountBadge.tsx, components/Onboarding.tsx
import type { EnvStatus, UpdateCheck } from '../../../shared/protocol'
// components/DiffPanel.tsx
import type { GitChange } from '../../../shared/protocol'
// components/BranchPicker.tsx  (renomeando Branch -> GitBranchInfo)
import type { GitBranchInfo } from '../../../shared/protocol'
// components/MicButton.tsx
import type { SpeechStatus, SpeechModel } from '../../../shared/protocol'
// components/Composer.tsx e lib/useExecutionTarget.ts
import type { SshConnection } from '../../../shared/protocol'
```

Combinado com T1, os casts `r.status as EnvStatus`, `r.branches as Branch[]`,
`r.changes as GitChange[]`, `r.status as SpeechStatus`, `r.connections as
SshConnection[]` desaparecem todos.

## T4 - MEDIO: `rpcCall` nao tem contrato de comando

`store/agent.ts:291-300`:

```ts
export async function rpcCall<T = unknown>(type: string, payload?: Record<string, unknown>)
```

`type` e string livre e `T` e afirmado pelo chamador, sem ligacao entre os dois.
Erro de digitacao no nome do comando compila (`agent.ts:317` `get_session_stats`,
`:322` `get_state`, `:348` `get_available_models`, `:457` `list_schedules`, ...),
e o `payload` nao e checado: `agent.ts:514` manda `{ provider, modelId }` porque
o comentario em `:507-511` lembra do bug antigo - o compilador nao ajuda em nada
aqui. O mesmo vale para `bridge().send/fire` (`preload/index.ts:26-29`).

Correcao concreta em `src/shared/protocol.ts`:

```ts
/** Comando RPC -> payload de entrada e `data` de saida. */
export interface RpcContract {
  get_state: { req: void; res: AgentState }
  get_session_stats: { req: void; res: SessionStats }
  get_available_models: { req: void; res: { models: ModelInfo[] } | ModelInfo[] }
  get_commands: { req: void; res: { commands: CommandInfo[] } }
  prompt: { req: { message: string; streamingBehavior: DeliveryBehavior; images?: ImagePayload[] }; res: unknown }
  set_model: { req: { provider: string; modelId: string }; res: unknown }
  set_thinking_level: { req: { level: ThinkingLevel }; res: unknown }
  switch_session: { req: { sessionPath: string }; res: { cancelled?: boolean } }
  list_schedules: { req: void; res: { jobs: AgentCronJob[] } }
  /* ... um por comando usado hoje ... */
}
export type RpcCommand = keyof RpcContract
```

E em `store/agent.ts`:

```ts
export async function rpcCall<C extends RpcCommand>(
  type: C,
  payload?: RpcContract[C]['req']
): Promise<RpcOutcome<RpcContract[C]['res']>>
```

`CommandInfo` (agent.ts:25) tambem deveria mudar de lugar junto: e a resposta de
`get_commands`, ou seja, protocolo, nao estado de UI.

## T5 - MEDIO: `Dock` e um tipo de dominio morando num componente

`components/StatusBar.tsx:146` declara
`export type Dock = 'files' | 'agents' | 'diff' | 'terminal' | 'schedules' | 'document' | null`.
O store, porem, guarda o pedido como string solta:

- `store/agent.ts:93` `dockRequest: string | null`
- `store/agent.ts:132` `requestDock: (kind: string) => void`
- `lib/useDock.ts:51` `setDock(dockRequest as Dock)` - cast so existe por causa disso

Chamadores passam literais que hoje ninguem valida: `components/DocumentCard.tsx:38`
(`'document'`), `components/QueuePopover.tsx:144` (`'agents'`). Um
`requestDock('agent')` compila e nao abre nada.

Correcao: mover `Dock` para `lib/dock.ts` (ou `src/shared/protocol.ts`, se o main
vier a conhecer o dock), e no store usar `dockRequest: Dock` e
`requestDock: (kind: NonNullable<Dock>) => void`. O cast em `useDock.ts:51` cai.

## T6 - MEDIO: parametros `unknown` no preload

`preload/index.ts:18` `saveSshConnections: (list: unknown)` e `:65`
`saveFolders: (state: unknown)`. O renderer sempre passa tipo conhecido -
`store/agent.ts:391` passa um `FolderState`. Com `unknown` no parametro,
qualquer coisa entra e o erro so aparece na sanitizacao do main.

Correcao: `saveFolders: (state: FolderState): Promise<Envelope<{ state: FolderState }>>`
e `saveSshConnections: (list: readonly SshConnection[]): Promise<Envelope>`,
importando os tipos de `src/shared/protocol.ts` (T3).

## T7 - MEDIO: `AgentMessage` nao modela a mensagem `toolResult`

`protocol.ts:81-89` declara `role: 'user' | 'assistant' | 'toolResult' | ...`,
mas nenhum campo de `toolResult` (`toolCallId`, `toolName`, `details`,
`isError`). O renderer remenda em cima:

- `store/transcript.ts:80-85` intersecta a mao (`msg as AgentMessage & { toolCallId?... }`)
- `store/transcript.ts:88` `(m.details ?? {}) as { durationMs?...; stderr?...; kernelRestarted?... }`
- `store/transcript.ts:101` `textOf(m as unknown as ToolResult)` - converte uma
  mensagem em `ToolResult` porque os dois por acaso tem `content[].text`

Correcao: transformar `AgentMessage` em union discriminada por `role` em
`protocol.ts`:

```ts
interface MessageBase { timestamp?: number; model?: string; provider?: string; usage?: Usage; stopReason?: string }
export interface ChatMessage extends MessageBase { role: 'user' | 'assistant' | 'custom' | 'bashExecution'; content: ContentBlock[] | string }
export interface ToolResultMessage extends MessageBase, ToolResult {
  role: 'toolResult'
  toolCallId: string
  toolName?: string
}
export type AgentMessage = ChatMessage | ToolResultMessage
```

Com isso `if (msg.role === 'toolResult')` (transcript.ts:165, :246) narrowing
para `ToolResultMessage` e as tres linhas acima ficam sem cast; `textOf(m)`
passa a receber um `ToolResult` de verdade.

## T8 - MEDIO: tipo conditional sem efeito em `transcript.ts:83`

```ts
details?: ToolExec extends never ? never : Record<string, unknown>
```

`ToolExec extends never` e sempre falso, entao o tipo e apenas
`Record<string, unknown>` - o conditional nao faz nada e sugere uma intencao que
o codigo nao cumpre. Correcao: resolvido por T7 (o campo passa a vir de
`ToolResultMessage['details']`); enquanto T7 nao entrar, escrever
`details?: ToolResult['details']`.

## T9 - MEDIO: envelope IPC inconsistente e sem tipo

O padrao documentado em `lib/ipc.ts:4-7` e `{ ok, ...dados, error? }`, mas
`app:info` (`src/main/index.ts:1030-1035`) devolve o objeto cru, sem `ok`. O
renderer lida com os dois formatos no mesmo arquivo:
`components/AccountBadge.tsx:40` (`i?.userName`, sem `ok`) e `:43-44`
(`r?.ok`). Como tudo e `any` (T1), nada disso aparece no `typecheck`.

Correcao: adotar `Envelope<T>` (T1) e uniformizar `app:info` para
`{ ok: true, info: AppInfo }`, com `AppInfo` em `src/shared/protocol.ts`
(`{ version: string; home: string; platform: Platform; userName: string }`).
Isso e mudanca de contrato: precisa entrar junto no renderer e no main.

## T10 - BAIXO: `platform: string` no store

`store/agent.ts:65` guarda `platform: string`, alimentado por
`lib/useBridge.ts:104` com o `process.platform` do main
(`src/main/index.ts:1033`). O unico consumidor compara com literal:
`lib/platform.ts:13` `s.platform === 'darwin'`. Um typo (`'darvin'`) compila.

Correcao: `export type Platform = 'darwin' | 'win32' | 'linux'` em
`src/shared/protocol.ts`, e no store `platform: Platform | ''`.

## T11 - BAIXO: estado imutavel sem `readonly`

O store e o reducer tratam tudo como imutavel (`store/transcript.ts:124`,
`:155`; `store/agent.ts:207`), mas os tipos permitem mutacao:
`Transcript.messages: UiMessage[]` (transcript.ts:46),
`tools: Record<string, ToolExec>` (`:47`), `AgentStore.messages`/`sessions`/
`models`/`parkedRuns` (agent.ts:56-59, :77). `protocol.ts:120-121` ja usa
`readonly string[]` em `SessionActions` - o padrao existe, so nao foi aplicado.

Correcao: `readonly messages: readonly UiMessage[]`,
`readonly tools: Readonly<Record<string, ToolExec>>` em `Transcript`, e o mesmo
nos campos de leitura de `AgentStore`. Baixo risco: o codigo ja nao muta.

## T12 - BAIXO: `blocksOf` confia no formato

`store/transcript.ts:66-70`: `if (Array.isArray(content)) return content as ContentBlock[]`.
Vem de JSONL lido do disco (`store/agent.ts:815-820`), ou seja, dado externo. Um
bloco com `type` desconhecido entra como se fosse `ContentBlock` e so quebra na
renderizacao.

Correcao: filtrar por `type` conhecido no lugar do cast:

```ts
const KNOWN: readonly ContentBlock['type'][] = ['text', 'thinking', 'toolCall', 'image']
function blocksOf(content: unknown): ContentBlock[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content.filter(
    (b): b is ContentBlock =>
      !!b && typeof b === 'object' && KNOWN.includes((b as { type?: ContentBlock['type'] }).type!)
  )
}
```

## T13 - BAIXO: `UiMessage.role` reescreve subconjunto do protocolo

`store/transcript.ts:5` declara `role: 'user' | 'assistant'`. E de fato o
subconjunto que a UI exibe (filtrado em `transcript.ts:111`), mas escrito a mao:
se `AgentMessage['role']` (protocol.ts:82) mudar, os dois nao brigam.

Correcao: `role: Extract<AgentMessage['role'], 'user' | 'assistant'>`.

## T14 - ALTO: `on()` nao tipa canal nem payload

`preload/index.ts:95-106` expoe:

```ts
on: (channel: string, listener: (payload: unknown) => void) => { ... }
```

O canal e `string` e a lista de canais permitidos existe so em runtime
(`preload/index.ts:96-101`, com `throw` em `:102`). O payload e `unknown` sem
guarda. Resultado: nome de canal errado compila e explode em runtime, e todo
assinante cast a mao:

- `components/Onboarding.tsx:89` `payload as EnvStatus` (canal `onboarding:env`)
- `components/AccountBadge.tsx:101` `payload as EnvStatus | undefined` (mesmo canal, outro tipo)
- `lib/useBridge.ts:38` `p as AgentEvent & { ... }`
- `lib/useBridge.ts:77` `p as Parameters<typeof store.setParkedRuns>[0]`
- `lib/useBridge.ts:87` `p as AgentTreeSnapshot`

Note a divergencia em `AccountBadge.tsx:101` vs `Onboarding.tsx:89`: o mesmo
canal e lido com dois tipos diferentes (`EnvStatus | undefined` e `EnvStatus`) e
nada reclama.

Correcao concreta: mapa canal -> payload em `src/shared/protocol.ts`, e a lista
de canais derivada dele no preload (uma fonte, nao duas):

```ts
export interface IpcEvents {
  'agent:event': AgentEvent
  'agent:response': { id?: string; res: RpcResponse }
  'agent:stderr': string
  'agent:fatal': string
  'agent:exit': { code: number | null }
  'agents:tree': AgentTreeSnapshot
  'agents:tree-error': string
  'onboarding:output': string
  'onboarding:env': EnvStatus
  'bridge:parked': ParkedRun[]
  'bridge:run-ended': { id: string }
  'terminal:data': { id: string; data: string }
  'terminal:exit': { id: string }
}
export type IpcChannel = keyof IpcEvents
export const IPC_CHANNELS: readonly IpcChannel[] = [ /* ... */ ]
```

No preload:

```ts
on: <C extends IpcChannel>(channel: C, listener: (payload: IpcEvents[C]) => void): (() => void) => {
  if (!IPC_CHANNELS.includes(channel)) throw new Error(`Canal nao permitido: ${channel}`)
  ...
}
```

Os cinco casts acima caem, e `ParkedRun` (`store/agent.ts:32`) precisa mudar de
lugar junto: e payload de canal IPC, entao e protocolo.

---

## O que esta correto

- `global.d.ts` (8 linhas) declara a bridge com fidelidade **por construcao**:
  importa `PrimeApi = typeof api` (`preload/index.ts:111`) em vez de redigitar a
  superficie. Nao ha divergencia possivel entre `window.prime` e o preload. O
  problema nao esta na declaracao, esta no tipo de origem (T1).
- `src/shared/protocol.ts` esta bem estruturado no resto: unions nomeadas para
  todo estado enumeravel (`ThinkingLevel:6`, `QueueMode:103`,
  `DeliveryBehavior:106`, `AgentCronJobStatus:132`, `AgentCronScheduleKind:133`,
  `AgentCronJobSource:134`, `AgentHeartbeatDeliveryMode:137`, `BridgeStatus:249`),
  `ContentBlock` (`:75`) como union discriminada de verdade, `readonly` onde
  importa (`:120-121`), `RpcResponse<T>` generico (`:219`) e opcionalidade
  documentada com o porque (`:49-57`, `:274-279`). Nenhum `any` no arquivo.
- Nenhum `any` implicito ou explicito no renderer alem de `lib/ipc.ts:18-19`
  (grep de `: any`, `<any>`, `as any`, `any[]`). Zero `@ts-ignore` e zero
  `@ts-expect-error` em todo `src/`.
- Os casts de literal para union sao seguros e legiveis - o valor esta na
  propria linha: `components/SchedulesPanel.tsx:434`, `components/Composer.tsx:537`,
  `components/QueuePopover.tsx:88`. Nao mexer.
- Casts de DOM corretos e minimos: `components/Modal.tsx:48`
  (`document.activeElement as HTMLElement | null`), `lib/usePopover.ts:40`
  (`e.target as Node`), `components/Composer.tsx:567` (`e.relatedTarget as Node`).
  Sao os casts que a lib do DOM exige; nenhum `e: any` em handler no renderer.
- Todos os hooks de `lib/` tem tipo de retorno explicito e nomeado - conferido
  um por um: `useBridge(): BridgeBoot`, `useWindowChrome(): WindowChrome`,
  `useTurnActivity(): TurnActivity`, `useResizable`, `useExecutionTarget():
  ExecutionTarget`, `useZoom(): Zoom`, `useAsync<T>(): Async<T>`,
  `useDictation(): Dictation`, `useDock(): DockState`, `useMicrophone():
  Microphone`, `useMessageWindow`, `useStickyScroll`, `usePopover<T extends
  HTMLElement>`. Nenhum retorno inferido vazando estrutura anonima.
- `usePopover<T extends HTMLElement = HTMLDivElement>` (`lib/usePopover.ts:27`)
  e o modelo certo de ref generica: os chamadores passam o elemento
  (`AccountBadge.tsx:28`, `BranchPicker.tsx:41`) e nao existe `useRef<any>` em
  lugar nenhum.


---

# Parte 2 - props dos componentes (AccountBadge -> Notice)

## Contexto que explica a maioria dos achados

`src/preload/index.ts` expõe tudo via `ipcRenderer.invoke`, cujo retorno é
`Promise<any>` (`src/preload/index.ts:8-111`), e `src/renderer/src/global.d.ts:5`
publica esse `typeof api` como `window.prime`. Consequência: **todo** `const r =
await window.prime.X()` no renderer é `any`, e `r.campo as T` é um cast sem
verificação — o compilador não checa nada. `src/renderer/src/lib/ipc.ts:19-21`
assume isso de forma explícita (`call: Promise<any>`, `pick: (res: any) => T`).
Correção estrutural (fora do escopo desta parte, mas é a raiz): tipar o envelope
por canal em `src/shared/protocol.ts` (ex.: `type Envelope<T> = { ok: true } & T |
{ ok: false; error?: string }`) e declarar `PrimeApi` com retornos concretos.

Também vale notar: `tsconfig.json` tem `strict: true`, mas **não** tem
`noUncheckedIndexedAccess` nem `exactOptionalPropertyTypes`. Vários acessos
indexados abaixo só são "seguros" por causa dessa ausência.

---

## AccountBadge.tsx

1. **ALTO — `EnvStatus` redefinido no renderer.** `AccountBadge.tsx:9-12` declara
   `interface EnvStatus` idêntica a `src/main/onboarding.ts:17-20`, e a mesma
   interface está triplicada em `src/renderer/src/components/Onboarding.tsx:11`.
   Correção: mover para `src/shared/protocol.ts` como
   `export interface EnvStatus { agent: { installed: boolean; path: string | null; version: string | null }; auth: { ok: boolean; providers: readonly string[]; envKeys: readonly string[] } }`
   e importar nos três pontos.
2. **ALTO — casts cegos sobre `any` do IPC.** `AccountBadge.tsx:35`
   (`r.status as EnvStatus`), `:88` (idem) e `:44`/`:90`
   (`r.update as typeof update`). O `as typeof update` é o pior deles: amarra o
   tipo de dado remoto ao tipo de uma variável de estado local (que inclui
   `| null`), então qualquer mudança no estado muda silenciosamente o contrato
   do IPC. Correção: `export interface AgentUpdateInfo { current: string | null;
   latest: string | null; available: boolean }` em `src/shared/protocol.ts` e
   leitura via `unwrap`/validador, não `as`.
3. **MEDIO — payload de evento sem narrowing real.** `AccountBadge.tsx:100-102`:
   `window.prime.on('onboarding:env', (payload) => { const next = payload as EnvStatus | undefined ... })`.
   `payload` é `unknown` (`src/preload/index.ts:101`) e o único "narrowing" é
   `next?.auth`, feito **depois** do cast. Correção: mapa de eventos tipado no
   protocolo (`interface PrimeEvents { 'onboarding:env': EnvStatus; 'terminal:exit': { id: string } ... }`)
   e `on<K extends keyof PrimeEvents>(channel: K, cb: (p: PrimeEvents[K]) => void)`
   no preload.
4. **BAIXO — tipo anônimo de estado.** `AccountBadge.tsx:31`:
   `useState<{ current: string | null; latest: string | null; available: boolean } | null>`
   — mesmo objeto do achado 2; usar `AgentUpdateInfo | null`.
5. **BAIXO — props inline em componente exportado.** `AccountBadge.tsx:21`
   (`{ onSignedOut }: { onSignedOut: () => void }`). Correção:
   `export interface AccountBadgeProps { onSignedOut: () => void }` no próprio arquivo.

## AgentTree.tsx

Bem tipado: consome `AgentNode`/`AgentTreeSnapshot` do protocolo
(`AgentTree.tsx:6`), sem `any` e sem cast.

1. **BAIXO — props inline.** `AgentTree.tsx:15`, `:28`, `:42` (internos, aceitável)
   e `:159` (`{ onClose }: { onClose: () => void }`, componente exportado).
   Correção: `export interface AgentTreeProps { onClose: () => void }`.

## BranchPicker.tsx

1. **ALTO — `Branch` redefinido.** `BranchPicker.tsx:7-11` duplica
   `GitBranchInfo` de `src/main/files.ts:143-148` (mesmos campos `name`,
   `current`, `upstream?`). Correção: mover `GitBranchInfo` para
   `src/shared/protocol.ts` e importar aqui; o main passa a importar do shared.
2. **MEDIO — cast cego no IPC.** `BranchPicker.tsx:49`
   (`setBranches(r.branches as Branch[])`) e `:50` (`Boolean(r.dirty)` sobre
   `any`). Correção: `unwrap(window.prime.gitBranches(), (r) => r as GitBranchesResult, ...)`
   com `GitBranchesResult { branches: readonly GitBranchInfo[]; dirty: boolean }`
   no protocolo.
3. **BAIXO — cast de mensagem de erro.** `BranchPicker.tsx:70`:
   `const message = (r?.error as string) ?? t('branch.failed')`. Se o main
   devolver não-string, o cast mente. Correção: `typeof r?.error === 'string' ? r.error : t('branch.failed')`.
4. **BAIXO — props inline.** `BranchPicker.tsx:27` (`{ chipClass: string }`).
   Correção: `export interface BranchPickerProps { chipClass: string }`.

## Butterfly.tsx

Bem tipado: `Butterfly.tsx:9` só recebe `size?: number` e `className?: string`,
sem `any`, sem cast, sem estado.

## CommandPalette.tsx

1. **MEDIO — `Item.id: string` faz papel de discriminante.**
   `CommandPalette.tsx:6-11` declara `id: string`, e `:112` decide o ícone com
   `item.id === 'new' || item.id === 'compact'` — comparação de string mágica
   contra ids que também podem vir de skills (`:34`, `id: c.name`). Correção:
   `type Item = { kind: 'builtin'; id: 'new' | 'compact'; label: string; hint: string; run: () => void | Promise<void> } | { kind: 'skill'; id: string; ... }`
   e trocar `:112` por `item.kind === 'builtin'`. O tipo pode ficar local
   (é só de UI), mas exportado para teste.
2. **BAIXO — evento DOM sem elemento.** `CommandPalette.tsx:54`:
   `function onKeyDown(e: React.KeyboardEvent)`, usado em uma `div`
   (`:82`). Correção: `React.KeyboardEvent<HTMLDivElement>`.
3. **BAIXO — props inline.** `CommandPalette.tsx:13`. Correção:
   `export interface CommandPaletteProps { open: boolean; onClose: () => void }`.

## Composer.tsx

1. **ALTO — `SshConnection` mora num componente.** `Composer.tsx:18-25` exporta
   `SshConnection`, duplicando `src/main/ssh.ts:78-85`; pior, um hook importa o
   tipo de dentro de um componente: `src/renderer/src/lib/useExecutionTarget.ts:2`.
   Correção: mover para `src/shared/protocol.ts` e importar em main, lib e
   componentes.
2. **ALTO — `picked` com cast + asserções não-nulas.** `Composer.tsx:489`
   (`r.picked as { path: string; isImage: boolean; data?: string; mimeType?: string }[]`)
   e `:495` (`data: p.data!`, `mimeType: p.mimeType!`). São três mentiras
   encadeadas sobre um `any`: se o main mudar e não mandar `data`, o anexo vira
   `data: undefined` e a imagem sobe quebrada sem erro de compilação. Correção,
   em `src/shared/protocol.ts`:
   `export type PickedAttachment = { isImage: true; path: string; data: string; mimeType: string } | { isImage: false; path: string }`
   — a união discriminada elimina os dois `!`.
3. **MEDIO — alvo de execução como objeto anônimo repetido.**
   `Composer.tsx:87`, `:180`, `:186`, e ainda `src/main/index.ts:162`, `:222`,
   `:376`: o literal `{ kind: 'local' | 'ssh'; target?: string }` aparece seis
   vezes. Correção: `export interface ExecutionTarget { kind: 'local' | 'ssh'; target?: string }`
   em `src/shared/protocol.ts`.
4. **MEDIO — cast cego no IPC.** `Composer.tsx:186`
   (`r.execution as { kind: 'local' | 'ssh'; target?: string }`). Correção: usar
   `ExecutionTarget` + `unwrap`.
5. **MEDIO — blocos grandes de props inline.** `Composer.tsx:86-95`
   (`ExecutionMenu`), `:168-175` (`ContextChips`) e `:262-272` (`Composer`, 9
   props). O componente exportado é o principal do app e não tem tipo nomeado.
   Correção: `export interface ComposerProps { ... }` (e `ExecutionMenuProps`,
   `ContextChipsProps` locais) no próprio arquivo.
6. **BAIXO — parâmetro estrutural em vez do tipo do domínio.**
   `Composer.tsx:376`: `function applyCommand(item: { name: string })`, enquanto
   os itens vêm de `commands` (`:280`), que é `CommandInfo[]`
   (`src/renderer/src/store/agent.ts:25-28`). Correção: `item: CommandInfo`.
7. **BAIXO — acesso indexado sem guarda.** `Composer.tsx:429`
   (`applyCommand(slashItems[slashCursor])`) e `:345` (`m[1]`). Sem
   `noUncheckedIndexedAccess` o TS diz que é sempre definido; em runtime não é.
   Correção: guarda explícita (`const item = slashItems[slashCursor]; if (!item) return`)
   ou ligar a flag no `tsconfig.json`.
8. **BAIXO — cast em array literal.** `Composer.tsx:537`:
   `(['steer', 'followUp'] as DeliveryBehavior[])`. Correção:
   `const DELIVERY_OPTIONS = ['steer', 'followUp'] as const satisfies readonly DeliveryBehavior[]`
   (constante de módulo, evita realocar por render).
9. **BAIXO — props de array sem `readonly`.** `Composer.tsx:88`, `:172`, `:266`
   (`connections: SshConnection[]`). Correção: `readonly SshConnection[]` — o
   componente só lê.

## ConfirmDialog.tsx

Bem tipado: sem props, consome `ConfirmRequest` da store
(`src/renderer/src/store/agent.ts:16-23`), sem `any` e sem cast.

## DiffPanel.tsx

1. **ALTO — `GitChange` redefinido.** `DiffPanel.tsx:9-14` duplica
   `src/main/files.ts:315-322` (que ainda documenta o formato do `status`).
   Correção: mover `GitChange` para `src/shared/protocol.ts`.
2. **MEDIO — `status: string` solto.** `DiffPanel.tsx:11` recebe o código de duas
   letras do `git status --porcelain`, e `mark()` (`:21-28`) decide por
   `includes('D'|'A'|'R')` com fallback `'M'`. Correção: no protocolo,
   `export type GitStatusCode = string & { readonly __porcelain: unique symbol }`
   é exagero; o prático é tipar a **saída**:
   `function mark(status: string): { letter: 'N' | 'D' | 'A' | 'R' | 'M'; className: string; title: 'untracked' | 'deleted' | 'added' | 'renamed' | 'modified' }`
   e manter o `status` cru documentado como código porcelain.
3. **MEDIO — casts no `unwrap`.** `DiffPanel.tsx:64` (`r.changes as GitChange[]`)
   e `:80` (`r.diff as string`). É o padrão documentado em `lib/ipc.ts`, mas
   segue sem verificação. Correção: envelopes tipados por canal (ver contexto
   no topo); com isso o `pick` deixa de precisar de `as`.
4. **BAIXO — props inline.** `DiffPanel.tsx:59` e `:31` (`DiffBody`). Correção:
   `export interface DiffPanelProps { onClose: () => void }`.

## DockHost.tsx

Props já em interface exportada (`DockHost.tsx:21-26`) — é o padrão certo do
conjunto.

1. **MEDIO — `switch` sem exaustividade.** `DockHost.tsx:29-44`: `default: return null`
   engole tanto `dock === null` quanto qualquer valor novo de `Dock`
   (`src/renderer/src/components/StatusBar.tsx:146`). Acrescentar `'usage'` ao
   union não gera erro nenhum — o painel simplesmente não abre. Correção:
   `case null: return null` e
   `default: { const _exhaustive: never = dock; return _exhaustive }`.
2. **BAIXO — tipo de domínio dentro de componente.** `DockHost.tsx:7` importa
   `Dock` de `./StatusBar`. `Dock` é estado de UI compartilhado (usado também em
   `src/renderer/src/lib/useDock.ts`). Correção: mover o `type Dock` para
   `src/renderer/src/lib/useDock.ts` (ou um `types.ts` do renderer) e importar
   nos dois.

## DockPanel.tsx

1. **MEDIO — 14 props inline em componente reutilizável.**
   `DockPanel.tsx:17-55`. É a casca usada por `AgentTree`, `FilesPanel`,
   `DiffPanel`, `DocumentPanel`, `SchedulesPanel` e `TerminalPanel`: a assinatura
   é API interna e deveria ser nomeada. Correção: `export interface DockPanelProps { storageKey: string; defaultWidth: number; min: number; max: number; icon?: ReactNode; title?: string; onClose: () => void; actions?: ReactNode; header?: ReactNode; subheader?: ReactNode; footer?: ReactNode; headerBorder?: boolean; bodyClassName?: string; children: ReactNode }`
   no próprio arquivo (os JSDoc por campo continuam valendo).
2. **BAIXO — `storageKey: string` solto.** `DockPanel.tsx:33`: a chave alimenta
   `prime-desk:width:${key}` e o doc avisa que trocá-la apaga a largura do
   usuário. Correção: `storageKey: 'agent-tree' | 'files' | 'diff' | 'document' | 'terminal' | 'schedules'`
   (union fechado no próprio arquivo), que impede chave nova por engano.

## DocumentCard.tsx

1. **MEDIO — `requestDock` aceita `string`.** `DocumentCard.tsx:38` chama
   `requestDock('document')` contra a assinatura
   `requestDock: (kind: string) => void` (`src/renderer/src/store/agent.ts:132`):
   `requestDock('documento')` compila. Correção: na store,
   `requestDock: (kind: Exclude<Dock, null>) => void`.
2. **BAIXO — props inline.** `DocumentCard.tsx:14-24`. Correção:
   `export interface DocumentCardProps { id: string; text: string; detected: DetectedDocument; streaming: boolean }`.
3. **BAIXO — documento aberto como objeto anônimo.** `DocumentCard.tsx:37`
   (`openDocument({ id, title: detected.title, text })`) contra
   `src/renderer/src/store/agent.ts:103`/`:134`, que repetem
   `{ id: string; title: string; text: string }`. Correção: `export interface OpenDocument`
   na store e usar nos dois pontos.

## DocumentPanel.tsx

Bem tipado: uma prop (`DocumentPanel.tsx:19`), sem `any` e sem cast.

1. **BAIXO — props inline.** `DocumentPanel.tsx:19`. Correção:
   `export interface DocumentPanelProps { onClose: () => void }`.

## FileViewer.tsx

1. **ALTO — resposta de `readFile` consumida como `any`, sem cast e sem
   validação.** `FileViewer.tsx:52-60`: `r.size ?? 0`, `r.truncated`,
   `r.binary`, `r.content ?? ''`. Não há nem o cast que os outros arquivos usam —
   é `any` puro alimentando decisões de risco: `meta.binary` escolhe o caminho
   com `dangerouslySetInnerHTML` (`:218`) e `meta.truncated` libera/bloqueia a
   gravação (`:69`, `:134`). Correção: em `src/shared/protocol.ts`,
   `export interface FileRead { content: string; size: number; truncated: boolean; binary: boolean }`
   e leitura por `unwrap(window.prime.readFile(path), (r) => r as FileRead, ...)`
   — melhor ainda com checagem de `typeof`.
2. **MEDIO — estado com tipo anônimo.** `FileViewer.tsx:41`:
   `useState<{ size: number; truncated?: boolean; binary?: boolean }>({ size: 0 })`.
   O mesmo objeto do achado 1, escrito diferente (opcionais aqui, obrigatórios
   no main). Correção: reusar `FileRead`/`Pick<FileRead, 'size' | 'truncated' | 'binary'>`.
3. **BAIXO — cast de erro do IPC.** `FileViewer.tsx:54` e `:74`
   (`r?.error ?? t(...)` sobre `any`): não há cast, mas o tipo resultante é
   `any`, então `setError` aceita qualquer coisa. Correção: envelope tipado
   (mesma raiz do achado 1).
4. **BAIXO — props inline.** `FileViewer.tsx:27-37`. Correção:
   `export interface FileViewerProps { path: string; onClose: () => void; active?: boolean }`
   (mantendo o JSDoc de `active`).
5. **BAIXO — `langOf` devolve `string | null`.** `FileViewer.tsx:20-25`: o valor
   é sempre um dos valores de `LANG_BY_EXT` (`:10`). Correção:
   `function langOf(path: string): (typeof LANG_BY_EXT)[string] | null` com
   `const LANG_BY_EXT = { ... } as const` e
   `Record<string, HljsLang>` onde `type HljsLang = typeof LANG_BY_EXT[keyof typeof LANG_BY_EXT]`.
   Bem tipado no resto: `state` é união fechada (`:42`).

## FilesPanel.tsx

Consome `DirEntry` do protocolo (`FilesPanel.tsx:6`) — correto.

1. **MEDIO — casts cegos no IPC.** `FilesPanel.tsx:43`
   (`r.entries as DirEntry[]`), `:156` (`rootRes.root as string`) e `:159`
   (`r.entries as DirEntry[]`). Correção: envelopes tipados
   (`FilesListResult { entries: readonly DirEntry[] }`, `FilesRootResult { root: string }`
   em `src/shared/protocol.ts`).
2. **BAIXO — props inline no componente exportado.** `FilesPanel.tsx:136-144`
   (o interno `NodeProps` em `:26-32` já está nomeado — é o padrão a seguir).
   Correção: `export interface FilesPanelProps { onClose: () => void; onOpenFile: (path: string) => void; onQuote: (path: string) => void }`.
3. **BAIXO — falta `readonly`.** `FilesPanel.tsx:37`, `:153`, `:166`: listas de
   `DirEntry` só são lidas. Correção: `readonly DirEntry[]`.

## Markdown.tsx

Bem tipado: evento DOM com elemento (`Markdown.tsx:9`,
`React.MouseEvent<HTMLAnchorElement>`), `ref` tipada (`:18`,
`useRef<HTMLPreElement>`), props opcionais explícitas (`:53-60`), sem `any`.

1. **BAIXO — props inline em componente exportado.** `Markdown.tsx:53-60`.
   Correção: `export interface MarkdownProps { text: string; highlight?: boolean }`.

## Message.tsx

Bom uso de predicados de tipo sobre a união do protocolo: `Message.tsx:64` e
`:69` (`(b): b is Extract<ContentBlock, { type: 'text' }>`).

1. **MEDIO — mapa de execuções indexado sem `undefined`.** `Message.tsx:183`:
   `exec={tools[block.id]}` sobre `tools: Record<string, ToolExec>` (`:58`).
   O `ToolCard` já declara `exec?: ToolExec`
   (`src/renderer/src/components/ToolCard.tsx:16`) e trata a ausência
   (`ToolCard.tsx:30`), mas o tipo aqui afirma que sempre existe. Correção:
   `tools: Readonly<Record<string, ToolExec | undefined>>` na prop (ou ligar
   `noUncheckedIndexedAccess`).
2. **BAIXO — `map` sobre união sem exaustividade.** `Message.tsx:148-189`: trata
   `thinking`, `text`, `toolCall` e cai em `return null` — o caso `image` do
   `ContentBlock` (`src/shared/protocol.ts`, união de 4 variantes) fica invisível
   no ramo do assistente. Correção: `else { const _rest: Extract<ContentBlock, { type: 'image' }> = block }`
   ou tratar `image` explicitamente antes do `return null`.
3. **BAIXO — props inline.** `Message.tsx:52-61`. Correção:
   `export interface MessageProps { msg: UiMessage; tools: Readonly<Record<string, ToolExec | undefined>>; continuation?: boolean }`.

## MicButton.tsx

1. **ALTO — `SpeechModel`/`SpeechStatus` redefinidos.** `MicButton.tsx:9-16`
   duplica `src/main/speech.ts:27-33` e `:42-51` — e perde os JSDoc que explicam
   `ready`, `server` e `missing`. Correção: mover os dois para
   `src/shared/protocol.ts` e importar no main e aqui.
2. **MEDIO — casts cegos no IPC.** `MicButton.tsx:76` (`r.status as SpeechStatus`),
   `:92` (`(r?.error as string)`) e `:101` (`r.command as string`, usado para
   montar comando de terminal). Correção: `SpeechSetupCommand { command: string }`
   no protocolo + `unwrap`; para o erro, `typeof r?.error === 'string'`.
3. **BAIXO — props inline.** `MicButton.tsx:50-55`. Correção:
   `export interface MicButtonProps { onPartial: (text: string) => void; onFinal: (text: string) => void }`
   (mantendo os JSDoc). O resto está bom: `mic.status` vem do union `MicStatus`
   de `src/renderer/src/lib/useMicrophone.ts:26` e os refs são tipados (`:62`).

## Modal.tsx

Este arquivo é o padrão de diálogo obrigatório do projeto (`CONTRIBUTING.md`,
"Padrão de modal"), então a assinatura é API interna de fato.

1. **MEDIO — props inline nos três exports.** `Modal.tsx:13-29` (`Modal`),
   `:166-174` (`Field`), `:187-193` (`Button`). Correção: `export interface ModalProps`,
   `export interface FieldProps` e
   `export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'ghost' | 'subtle' }`
   no próprio arquivo — hoje quem quer envolver o `Button` não tem tipo para citar.
2. **BAIXO — cast de `activeElement`.** `Modal.tsx:48`:
   `document.activeElement as HTMLElement | null`. Correção:
   `const el = document.activeElement; restoreFocus.current = el instanceof HTMLElement ? el : null`
   (o arquivo já usa `instanceof` em `:61`, é só ser consistente).
   `variant` já é union fechado (`:192`) e os refs são tipados (`:30-31`) — o
   resto está correto.

## ModelPicker.tsx

Bem tipado no essencial: importa `THINKING_LEVELS` e `ThinkingLevel` do
protocolo (`ModelPicker.tsx:4`) e usa `Record<ThinkingLevel, string>` exaustivo
(`:10-13`), que quebra o build se um nível novo entrar no protocolo.

1. **BAIXO — cast redundante.** `ModelPicker.tsx:79`:
   `const level = (state?.thinkingLevel ?? 'medium') as ThinkingLevel`.
   `AgentState.thinkingLevel` já é `ThinkingLevel`
   (`src/shared/protocol.ts`), logo a expressão já tem o tipo certo; o `as`
   só serviria para esconder uma futura mudança de tipo. Correção: remover o
   cast (`const level: ThinkingLevel = state?.thinkingLevel ?? 'medium'`).

## Notice.tsx

Bem tipado: sem props, `notice.kind` vem do union `'error' | 'info'` da store
(`src/renderer/src/store/agent.ts:73`), sem `any` e sem cast.

1. **BAIXO — tipo do aviso é anônimo na store.** `Notice.tsx:12` e `:18` leem um
   objeto declarado inline em `src/renderer/src/store/agent.ts:73`. Correção:
   `export interface NoticeState { kind: 'error' | 'info'; text: string; at: number }`
   na store e reuso em `notify` (`store/agent.ts:123`).

---

---

# Parte 3 - props dos componentes (ObservedPanel -> Welcome)

## ObservedPanel.tsx

1. **MEDIO — cadeia de `if` sobre união sem exaustividade.**
   `ObservedPanel.tsx:24-38`: `obs.status` é `'loading' | 'live' | 'closed' | 'error'`
   (`store/agent.ts:45`), mas o componente testa três casos e devolve o ícone de
   erro no `return` final (linha 38). Um status novo cairia em "erro" sem aviso
   do compilador. A mesma decisão está duplicada em texto em
   `ObservedPanel.tsx:133-139`.
   Correção: `switch (obs.status)` com `default: { const _x: never = obs.status; return null }`,
   e extrair um mapa `Record<Observed['status'], { icon; label }>` no próprio arquivo.
2. **BAIXO — props inline em helper local.** `ObservedPanel.tsx:22`
   (`{ obs, size }: { obs: Observed; size: number }`). Aceitável por ser interno;
   se ganhar mais um call site, virar `interface StatusIconProps`.
3. **BAIXO — acesso por índice sem guarda.** `ObservedPanel.tsx:65` (`observed[activeSessionId]`)
   e `ObservedPanel.tsx:92` (`observed[id]`) tipam como `Observed` não-opcional
   porque `noUncheckedIndexedAccess` está desligado; `obs` é checado na linha 79,
   `o` (linha 92) não. Correção: `const o = observed[id]; if (!o) return null`.

## Onboarding.tsx

4. **ALTO — contrato do main redefinido localmente.** `Onboarding.tsx:11-14`
   declara `interface EnvStatus` (não exportada) e ela é reafirmada por cast em
   dois pontos: `Onboarding.tsx:67` (`r.status as EnvStatus`) e
   `Onboarding.tsx:89` (`payload as EnvStatus`). O produtor real é o handler
   `onboarding:check`/`onboarding:env` no main. Divergência de shape passa em
   silêncio nos dois lados.
   Correção: mover para `src/shared/protocol.ts`:
   `export interface EnvStatus { agent: { installed: boolean; path: string | null; version: string | null }; auth: { ok: boolean; providers: string[]; envKeys: string[] } }`
   e `export interface EnvCheckResult { ok: boolean; status?: EnvStatus; error?: string }`;
   anotar `checkEnvironment: (): Promise<EnvCheckResult> => ...` no preload.
5. **ALTO — `unknown` de evento sem narrowing.** `Onboarding.tsx:88-89`: o listener
   de `window.prime.on` recebe `payload: unknown` (preload/index.ts:98) e o código
   faz cast direto para `EnvStatus`, sem checar `agent`/`auth`. Basta o main mudar
   o envelope para a tela travar em runtime com tipo "verde".
   Correção: type guard local `function isEnvStatus(v: unknown): v is EnvStatus`
   (ou canal tipado `on<'onboarding:env'>`), e ignorar payload inválido.
6. **MEDIO — casts pontuais sobre `any` do IPC.** `Onboarding.tsx:77`
   (`r.command as string`) e `Onboarding.tsx:143` (`port.port as number`).
   Correção: `InstallCommandResult { ok: boolean; command?: string }` e
   `LoginPortResult { free: boolean; port: number }` em `protocol.ts`; sem cast no componente.
7. **BAIXO — props inline em componente exportado.** `Onboarding.tsx:46`
   (`{ onReady }: { onReady: () => void }`). Sugestão: `export interface OnboardingProps { onReady: () => void }`.
8. **BAIXO — helper local sem prop nomeada.** `Onboarding.tsx:18-28` (`StepRow`).
   `Stage` (`Onboarding.tsx:16`) está correto: união fechada, uso local.

## PanelState.tsx

Bem tipado: três componentes de apresentação com props primitivas explícitas
(`PanelState.tsx:12,21,25`), sem cast, sem `any`.

## PendingBubble.tsx

Bem tipado: prop única `label?: string` (`PendingBubble.tsx:10`).

## QueuePopover.tsx

9. **MEDIO — props inline em componente exportado.** `QueuePopover.tsx:105-108`.
   Correção: `export interface QueuePopoverProps { onClose: () => void; trigger: RefObject<HTMLElement | null> }`
   no próprio arquivo (é o padrão já usado em `Transcript.tsx:16`).
10. **BAIXO — `React.ReactNode` via namespace global.** `QueuePopover.tsx:39` usa
    `React.ReactNode` sem `import`; `StatusBar.tsx:1` importa `type ReactNode`.
    Padronizar em `import type { ReactNode } from 'react'`.
11. **BAIXO — cast de literal de união.** `QueuePopover.tsx:88`
    (`['one-at-a-time', 'all'] as QueueMode[]`). Correção: constante módulo
    `const MODES = ['one-at-a-time', 'all'] as const satisfies readonly QueueMode[]`.
12. **BAIXO — chave de i18n derivada de união sem checagem.** `QueuePopover.tsx:169`
    (`t(\`queue.phase.${active.phase}\`)`); `t` aceita `string` (`i18n/index.ts:1343`).
    Fora do escopo desta parte corrigir `t`, mas o call site é o beneficiário.

Ponto positivo: `items: readonly string[]` (`QueuePopover.tsx:38`) respeita
`SessionActions.steering/followUps` como `readonly` (protocol.ts:118-119), e
`ModeToggle` usa `QueueMode` importado (`QueuePopover.tsx:80-81`).

## ResizeHandle.tsx

13. **MEDIO — evento DOM sem tipo de elemento.** `ResizeHandle.tsx:13`
    (`onMouseDown: (e: React.MouseEvent) => void`) enquanto o handler é ligado a
    uma `div` (`ResizeHandle.tsx:18`). Correção:
    `onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void`, alinhando com
    `Resizable.onMouseDown` (`lib/useResizable.ts`), que também é genérico solto.
14. **BAIXO — props inline em componente exportado.** `ResizeHandle.tsx:5-15`.
    Sugestão: `export interface ResizeHandleProps` com `side: 'right' | 'left'`
    (união já correta) no próprio arquivo.

## SchedulesPanel.tsx

15. **MEDIO — evento do agente tipado ad hoc.** `SchedulesPanel.tsx:138-140`
    (`const ev = payload as { type?: string }`). Existe `AgentEvent` em
    `protocol.ts` (com o ramo aberto `{ type: string; [k: string]: unknown }`).
    Correção: `const ev = payload as AgentEvent` + guarda
    `if (typeof ev?.type === 'string' && ev.type === 'heartbeats_changed')`; melhor
    ainda, adicionar `| { type: 'heartbeats_changed' }` ao union em `protocol.ts`,
    já que o painel depende desse evento.
16. **MEDIO — callback assíncrono aceito como `() => void`.** `SchedulesPanel.tsx:156`
    declara `run: () => void`, e recebe funções `async` em
    `SchedulesPanel.tsx:173` e `SchedulesPanel.tsx:207`: a Promise é descartada
    sem o compilador reclamar. Correção: `run: () => void | Promise<void>`
    (mesma assinatura de `ConfirmRequest.onConfirm`, `store/agent.ts:22`) e
    `void run()` no corpo.
17. **MEDIO — união duplicada.** `SchedulesPanel.tsx:220`
    (`action: 'pause' | 'resume' | 'clear'`) repete o parâmetro de
    `updateHeartbeat` (`store/agent.ts:489`). Correção:
    `export type HeartbeatAction = 'pause' | 'resume' | 'clear'` em
    `src/shared/protocol.ts`, consumida pelos dois.
18. **BAIXO — props inline em componente exportado.** `SchedulesPanel.tsx:103`.
19. **BAIXO — cast de literal de união.** `SchedulesPanel.tsx:434`
    (`['steer', 'follow_up'] as AgentHeartbeatDeliveryMode[]`) → `as const satisfies`.
20. **BAIXO — chave de i18n dinâmica.** `SchedulesPanel.tsx:59`, `:90`, `:96`.

Pontos positivos: `StatusBadge` usa `AgentCronJob['status']`
(`SchedulesPanel.tsx:50`), `isFinished(job: AgentCronJob): boolean` tem retorno
explícito (`SchedulesPanel.tsx:46`) e os dados vêm de `RpcOutcome<...>` tipado no store.

## SessionMenu.tsx

21. **MEDIO — interface de props genérica e não exportada.** `SessionMenu.tsx:14`
    (`interface Props`). Correção: `export interface SessionMenuProps` e
    `groups: readonly Group[]` (hoje `Group[]`, `SessionMenu.tsx:16`).
22. **MEDIO — `!` sobre campo opcional de modelo frouxo.** `SessionMenu.tsx:190`
    (`moveTo(g.folderId!)`) depois de filtrar por `g.kind === 'folder'`
    (`SessionMenu.tsx:128`). O `!` só existe porque `Group` não é união
    discriminada (`lib/grouping.ts:3-11`: `kind: 'folder' | 'auto'` com
    `folderId?: string`).
    Correção em `lib/grouping.ts`:
    `export type Group = { key: string; label: string; sessions: SessionSummary[] } & ({ kind: 'folder'; folderId: string } | { kind: 'auto'; folderId?: never })`;
    aí `g.folderId` é `string` sem assertion.
23. **BAIXO — `rpc('clone')` sem parâmetro de tipo.** `SessionMenu.tsx:89`: o
    resultado é `unknown | null` e só é comparado a `null` — correto hoje, mas
    anotar `rpc<{ sessionId?: string }>('clone')` documenta o retorno.
24. **BAIXO — retorno explícito ausente em handlers locais.** `SessionMenu.tsx:57,67,77,87,99`
    (`async function moveTo/togglePin/...`) são privados; só `title()`
    (`SessionMenu.tsx:40`) anota `Promise<void>`. Padronizar por consistência.

## Sidebar.tsx

25. **MEDIO — tipo condicional artesanal onde cabe o tipo do protocolo.**
    `Sidebar.tsx:355`:
    `(nodes: typeof tree extends null ? never : NonNullable<typeof tree>['roots'])`.
    Isso resolve para `AgentNode[]`. Correção: `import type { AgentNode } from '../../../shared/protocol'`
    e `const walk = (nodes: readonly AgentNode[]): void => {...}`.
26. **MEDIO — `!` sobre `folderId`.** `Sidebar.tsx:232`
    (`[sid]: group.folderId!`), mesmo defeito de modelo do achado 22; corrigido
    pela mesma união discriminada em `lib/grouping.ts`.
27. **MEDIO — props inline em componente exportado.** `Sidebar.tsx:313-322`.
    Correção: `export interface SidebarProps { home: string; onSignedOut: () => void; onNavigate?: () => void }`.
28. **BAIXO — props inline em helpers locais.** `Sidebar.tsx:31-48` (`SessionRow`)
    e `Sidebar.tsx:190-198` (`GroupHeader`); em `SessionRow` o array
    `groups: Group[]` (`Sidebar.tsx:47`) deveria ser `readonly Group[]`, pois é
    só repassado.
29. **BAIXO — retorno implícito em funções locais públicas do módulo.**
    `Sidebar.tsx:388` (`open`), `:396` (`createFolder`), `:445` (`toggleGroup`)
    sem `: Promise<void>`; `titleAll(): void` (`Sidebar.tsx:420`) já está anotada.

## SlashMenu.tsx

30. **MEDIO — `string` solto onde há união de domínio.** `SlashMenu.tsx:6`
    (`{ source: string }`) com três ramos e fallback (`SlashMenu.tsx:7-9`). A
    origem é `CommandInfo.source: string` (`store/agent.ts:28`).
    Correção: `export type CommandSource = 'skill' | 'template' | 'extension'`
    (em `store/agent.ts` ou em `protocol.ts`, já que vem de `get_commands`),
    `source: CommandSource` e `switch` exaustivo em `SourceIcon`.
31. **BAIXO — props inline em componente exportado + array mutável.**
    `SlashMenu.tsx:19-29`: `export interface SlashMenuProps { items: readonly CommandInfo[]; cursor: number; onPick: (item: CommandInfo) => void; onHover: (index: number) => void }`.

Ponto positivo: `useRef<HTMLDivElement>(null)` (`SlashMenu.tsx:31`) e
`querySelector<HTMLElement>` (`SlashMenu.tsx:35`) estão corretamente tipados.

## SshModal.tsx

32. **ALTO — resultado do IPC sem contrato nomeado, materializado por cast.**
    `SshModal.tsx:28` (`useState<{ ok: boolean; message: string } | null>`) e
    `SshModal.tsx:46` (`setResult(r as { ok: boolean; message: string })`). O
    produtor é o handler `ssh:test` no main; nada garante o shape, e
    `r.message` renderiza direto (`SshModal.tsx:147`).
    Correção: `export interface SshTestResult { ok: boolean; message: string }` em
    `src/shared/protocol.ts`, usada pelo handler do main e por
    `testSsh: (conn: SshConnection): Promise<SshTestResult>` no preload; o
    componente fica sem cast.
33. **BAIXO — props inline em componente exportado.** `SshModal.tsx:16-24`
    (`SshForm` já está corretamente exportada em `SshModal.tsx:6-12`).
    Sugestão: `export interface SshModalProps { open: boolean; onClose: () => void; onSubmit: (form: SshForm) => void }`.

Ponto positivo: `set<K extends keyof SshForm>(key: K, value: string)`
(`SshModal.tsx:30`) é a assinatura correta para o setter genérico.

## StalledTurnNotice.tsx

Bem tipado: sem props, consome `Stall` de `lib/useTurnActivity`
(`StalledTurnNotice.tsx:27`) e narrowing correto em `stall.kind === 'tool' && stall.tool`
(`StalledTurnNotice.tsx:34`).

## StatusBar.tsx

34. **MEDIO — props inline em componente exportado.** `StatusBar.tsx:181-189`.
    Correção: `export interface StatusBarProps { onToggleSidebar?: () => void; dock: Dock; onDock: (kind: Exclude<Dock, null>) => void }`.
35. **BAIXO — `Dock` inclui `null` no próprio alias.** `StatusBar.tsx:146`
    (`export type Dock = 'files' | ... | null`) obriga `Exclude<Dock, null>` no
    consumidor (`StatusBar.tsx:188`). Mais limpo:
    `export type DockKind = 'files' | 'agents' | 'diff' | 'terminal' | 'schedules' | 'document'`
    e `export type Dock = DockKind | null`.
36. **BAIXO — props inline em helpers locais.** `StatusBar.tsx:19` (`ContextRing`),
    `:53-56` (`MetricsPopover`), `:149-161` (`ToolButton`).

Pontos positivos: `pct: number | null` (`StatusBar.tsx:19`) reproduz
`ContextUsage.percent` (protocol.ts:56) sem esconder o `null`;
`useRef<HTMLButtonElement>(null)` (`StatusBar.tsx:201`) casa com `RefObject<HTMLElement | null>`
esperado por `usePopover`.

## TerminalPanel.tsx

37. **ALTO — `Tab` deveria ser união discriminada; o cast esconde isso.**
    `TerminalPanel.tsx:19-27` declara um `Tab` com `kind: 'shell' | 'file'` e
    ambos `path?` e `command?` opcionais. A consequência aparece em
    `TerminalPanel.tsx:218` (`path={tab.path as string}`): o cast é necessário
    só porque o tipo não amarra "aba de arquivo tem `path`". Se um dia uma aba de
    arquivo for criada sem `path`, o `FileViewer` recebe `undefined` tipado como `string`.
    Correção, no próprio arquivo:
    `interface BaseTab { id: string; title: string }`,
    `interface ShellTab extends BaseTab { kind: 'shell'; command?: string }`,
    `interface FileTab extends BaseTab { kind: 'file'; path: string }`,
    `type Tab = ShellTab | FileTab`. Aí `tab.kind === 'file'`
    (`TerminalPanel.tsx:214`) já narrowa e o cast cai.
38. **MEDIO — cast de retorno do IPC.** `TerminalPanel.tsx:90-95`
    (`const path = r.path as string` sobre `pickWorkspaceFile()`).
    Correção: `export interface PickFileResult { ok: boolean; path?: string; error?: string }`
    em `protocol.ts` + anotação no preload; no componente, `if (!r.path) return`.
39. **BAIXO — props inline em componente exportado.** `TerminalPanel.tsx:36`.
40. **BAIXO — helper sem retorno anotado.** `TerminalPanel.tsx:30`
    (`const nextId = (prefix: string) => ...`) — inferido `string`, mas é util
    de módulo; `shellTab(n: number): Tab` (`TerminalPanel.tsx:32`) já está correto.

## TerminalView.tsx

41. **MEDIO — payloads de evento tipados por cast, sem validação.**
    `TerminalView.tsx:73-75` (`payload as { id: string; data: string }`) e
    `TerminalView.tsx:78-80` (`payload as { id: string; exitCode: number }`). Os
    canais `terminal:data`/`terminal:exit` são fixos (preload/index.ts:99-105) e
    o shape é duplicado aqui.
    Correção: em `src/shared/protocol.ts`,
    `export interface TerminalDataEvent { id: string; data: string }` e
    `export interface TerminalExitEvent { id: string; exitCode: number }`;
    idealmente `on` genérico por canal no preload
    (`on<K extends keyof ChannelPayloads>(channel: K, listener: (p: ChannelPayloads[K]) => void)`).
42. **MEDIO — retorno do IPC acessado sem tipo.** `TerminalView.tsx:91-99`
    (`created?.ok`, `created?.error`, `back?.scrollback`) são `any` vindos de
    `createTerminal`/`terminalScrollback`. Correção: `TerminalCreateResult`
    (`{ ok: boolean; error?: string }`) e `TerminalScrollbackResult`
    (`{ scrollback?: string }`) em `protocol.ts`.
43. **BAIXO — props inline em componente exportado.** `TerminalView.tsx:14-20`.
    Sugestão: `export interface TerminalViewProps { id: string; cwd: string; command?: string; onExit?: (code: number) => void }`.

Ponto positivo: `useRef<HTMLDivElement>(null)` (`TerminalView.tsx:21`) e o ref de
spawn tipado por inferência de `{ cwd, command }` (`TerminalView.tsx:32`) estão corretos.

## ThinkingBlock.tsx

Bem tipado: `{ text: string; streaming: boolean }` (`ThinkingBlock.tsx:5`), sem
cast; único reparo estético é props inline em componente exportado (BAIXO, mesmo
padrão dos itens 14/39/43 — contabilizado uma vez ali).

## ToolCard.tsx

44. **BAIXO — props inline em componente exportado.** `ToolCard.tsx:11-20`.
    Sugestão: `export interface ToolCardProps { exec?: ToolExec; pendingName?: string; live?: boolean }`.
45. **BAIXO — comparações de status espalhadas, sem exaustividade.**
    `ToolCard.tsx:59-60` e `:123-124` derivam quatro estados visuais de
    `ToolExec['status']` (`store/transcript.ts`: `'running' | 'ok' | 'error'`)
    com flags booleanas. Funciona; um `switch (exec.status)` exaustivo ou um
    `Record<ToolExec['status'], ...>` protegeria a adição de um status novo.

Ponto positivo: nenhum `any`; `args: Record<string, unknown>` chega intacto de
`ContentBlock` (protocol.ts:81) e é consumido por `summary`/`codeFrom`, que já
declaram `Record<string, unknown>`.

## Transcript.tsx

Bem tipado, e é o padrão a seguir nos outros arquivos: `export interface TranscriptProps`
(`Transcript.tsx:16-28`) com `messages: readonly UiMessage[]`,
`scrollRef: RefObject<HTMLDivElement>` e `fatal: string | null`.

46. **BAIXO — `tools: Record<string, ToolExec>`** (`Transcript.tsx:22`) é só
    repassado; `Readonly<Record<string, ToolExec>>` comunicaria isso.

## UsagePanel.tsx

47. **BAIXO — acesso por índice sem guarda.** `UsagePanel.tsx:43,46`
    (`Math.max(...days.map(...))` e `days[0].day`) após checar `days.length === 0`
    na linha 42 — correto hoje, latente se `noUncheckedIndexedAccess` for ligado.
48. **BAIXO — retorno `string` em função de classe CSS.** `UsagePanel.tsx:31`
    (`function level(count: number, max: number): string`) devolve um conjunto
    fechado de 5 classes. `type LevelClass = 'bg-white/[0.05]' | 'bg-primary' | ...`
    tornaria o contrato explícito (uso local; baixo retorno).
49. **BAIXO — props inline.** `UsagePanel.tsx:13` (`Stat`), `:40` (`Heatmap`),
    `:84` (`UsagePanel`, exportado).

Ponto positivo: usa `UsageStats` do protocolo e tipos derivados
(`UsageStats['days']`, `UsageStats['days'][number] | null` em `UsagePanel.tsx:47-48`)
em vez de redefinir o shape.

## Welcome.tsx

50. **MEDIO — cast de retorno do IPC.** `Welcome.tsx:18-19`
    (`r?.ok` sobre `any` e `r.stats as UsageStats`). O tipo de destino é o certo
    (`protocol.ts:UsageStats`); o problema é a fronteira não tipada.
    Correção: `export interface UsageStatsResult { ok: boolean; stats?: UsageStats; error?: string }`
    em `protocol.ts` e `usageStats: (): Promise<UsageStatsResult>` no preload; o
    componente passa a fazer `if (r.ok && r.stats) setStats(r.stats)`.
51. **BAIXO — `info.home` sem tipo.** `Welcome.tsx:21-22`: `appInfo()` devolve
    `any`; `firstNameFromHome(info.home)` só compila porque o parâmetro do helper
    é `string`. Correção: `export interface AppInfo { home: string; version: string }`
    (confirmar campos com o handler `app:info` antes de fixar) no `protocol.ts`.
52. **BAIXO — `period` como `string` livre para chave de i18n.**
    `Welcome.tsx:30-31`: `t(\`welcome.${period}\`)`. `const period: 'morning' | 'afternoon' | 'evening'`
    documenta o conjunto.

---

---

# Contagem consolidada

| Parte | ALTO | MEDIO | BAIXO | Total |
|-------|------|-------|-------|-------|
| 1 - contrato e stores (T1-T14) | 4 | 6 | 4 | 14 |
| 2 - props A->N | 8 | 16 | 29 | 53 |
| 3 - props O->W | 4 | 18 | 30 | 52 |
| **Total** | **16** | **40** | **63** | **119** |

Observacao: 6 dos 16 ALTO (A1, A3, A4, A6, A8, B1) sao instancias do mesmo
achado estrutural T3 - tipo de contrato declarado duas vezes. Corrigir T1 + T3
retira, por consequencia, a maior parte dos MEDIO de cast de envelope das
Partes 2 e 3.

# Ordem de correcao sugerida

1. **T3** - levar `EnvStatus`, `SshConnection`, `SpeechStatus`/`SpeechModel`,
   `GitChange`, `GitBranchInfo`, `UpdateCheck`, `FileRead`, `AppInfo` para
   `src/shared/protocol.ts`; `src/main/*` re-exporta de la. Nenhum comportamento
   muda; e movimentacao de tipo.
2. **T1** - declarar `Envelope<T>` no protocolo e anotar o retorno de cada
   metodo do preload. Aqui os casts comecam a virar erro de compilacao, que e o
   ponto: cada erro apontado e um lugar onde o renderer supunha um formato.
3. **T14** - mapa `IpcEvents` e `on()` generico.
4. **T2** - fechar `KnownAgentEvent` e adicionar `isAgentEvent`; trocar os 6
   `as unknown as` por guarda.
5. **T7 + T8** - `AgentMessage` como union discriminada por `role`.
6. **T4** - `RpcContract` para comando/payload/resultado.
7. **T5, T6, T9, T10** - unions e assinaturas menores.
8. Props: nomear e exportar as interfaces de props dos componentes publicos
   (Partes 2 e 3), depois os BAIXO de `readonly` e exaustividade.

Passos 1-4 sao os que pagam: eles transformam falha silenciosa de runtime em
erro de `typecheck`.

# Metodo

- Leitura integral de `src/shared/protocol.ts` (341 l.), `src/preload/index.ts`
  (111 l.), `src/renderer/src/global.d.ts` (8 l.), `store/agent.ts` (1023 l.),
  `store/transcript.ts` (253 l.), `lib/ipc.ts` (25 l.) e dos 40 arquivos de
  `components/`.
- Greps de `: any`, `<any>`, `as any`, `any[]`, `@ts-ignore`,
  `@ts-expect-error`, `as unknown as`, `as [A-Z]`, `^export type|^export
  interface` em `src/renderer/src`, `src/preload`, `src/shared`.
- Comparacao dos tipos do renderer com os tipos reais dos handlers em
  `src/main/*` (`onboarding.ts`, `ssh.ts`, `speech.ts`, `files.ts`,
  `updates.ts`, `index.ts`).
- Dois achados (T1 e T2) foram **provados** compilando um arquivo de repro
  temporario fora de `src/` com o `tsc` do proprio projeto
  (`npx tsc --noEmit --strict`), sem tocar no codigo do repositorio.
