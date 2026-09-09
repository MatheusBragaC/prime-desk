# Auditoria - Escopo 3: Abstracao e separacao de camadas

Front-end: `src/renderer/src`. Auditoria de leitura, sem alteracao de codigo.
Cada achado cita `arquivo:linha`. Severidade: ALTO / MEDIO / BAIXO.

Camadas observadas hoje:

- `store/transcript.ts` - reducer puro de eventos (sem React, sem IPC).
- `store/agent.ts` - estado zustand + TODOS os comandos RPC/bridge (1023 linhas).
- `lib/*.ts` - hooks (`use*.ts`) e utilitarios puros (`format`, `grouping`, `toolSummary`, `schedule`, `attachments`, `agentMessage`, `agentUsage`, `pending`, `documentDetect`, `splitStream`, `markdownStream`) + `ipc.ts` (`unwrap`).
- `components/*.tsx` - apresentacao, mas com IPC direto em 15 arquivos.

---

## 1. Inversao de dependencia: `lib/` importa de `components/`

**Severidade: ALTO**

Evidencia:

- `src/renderer/src/lib/useExecutionTarget.ts:2` - `import type { SshConnection } from '../components/Composer'`
- `src/renderer/src/lib/useExecutionTarget.ts:3` - `import type { SshForm } from '../components/SshModal'`
- `src/renderer/src/lib/useAppShortcuts.ts:2` - `import type { Dock } from '../components/StatusBar'`
- `src/renderer/src/lib/useDock.ts:2` - `import type { Dock } from '../components/StatusBar'`
- Origem dos tipos: `src/renderer/src/components/Composer.tsx:18-25` (`SshConnection`), `src/renderer/src/components/StatusBar.tsx` (`Dock`), `src/renderer/src/components/SshModal.tsx` (`SshForm`).

A camada de baixo (hooks) depende da camada de cima (componentes). Isso trava a
ordem de leitura do projeto, impede mover um componente sem mexer em hook e cria
ciclo logico: `Composer` importa `usePopover`/`attachments` de `lib/`, e `lib/`
importa tipo do `Composer`.

Correcao concreta:

- Criar `src/renderer/src/lib/types.ts` (ou `lib/uiTypes.ts`) com:
  - `export type Dock = 'agents' | 'files' | 'diff' | 'terminal' | 'schedules' | 'document' | null`
  - `export interface SshConnection { id: string; name: string; host: string; port?: number; identity?: string; remotePath?: string }`
  - `export interface SshForm { name: string; host: string; port: string; identity: string; remotePath: string }`
- Componentes passam a reexportar do `lib/types.ts` (`export type { Dock } from '../lib/types'`) para nao quebrar chamadores.
- Regra de projeto a registrar no CONTRIBUTING: `lib/` e `store/` nunca importam de `components/`.

---

## 2. `store/agent.ts` com 1023 linhas: fatiar por dominio

**Severidade: ALTO** (manutencao; nao ha bug funcional)

O arquivo acumula cinco responsabilidades distintas, ja visiveis nos proprios
separadores de comentario (`agent.ts:280`, `:856`, `:992`):

| Faixa | Conteudo | Fatia proposta |
|---|---|---|
| `agent.ts:15-278` | tipos de UI + `create<AgentStore>` (estado, `ingest`, `observed`, `notice`, `confirm`, `document`, `terminalRequest`, `dockRequest`) | `store/agent.ts` (so o store) |
| `agent.ts:282-345` | `bridge()`, `rpcCall`, `rpc`, `refreshContext`, `refreshState`, `waitForState` | `store/rpc.ts` |
| `agent.ts:347-393` | `refreshModels`, `refreshCommands`, `refreshSessions`, `refreshTree`, `refreshFolders`, `mutateFolders` | `store/catalog.ts` |
| `agent.ts:395-529` | `sendPrompt`, `abortTurn`, `setSteeringMode`, `setFollowUpMode`, `setModel`, `setThinking`, `compactNow` | `store/turn.ts` |
| `agent.ts:456-492` | `listSchedules`, `addSchedule`, `cancelSchedule`, `getHeartbeat`, `setHeartbeat`, `updateHeartbeat` | `store/schedules.ts` |
| `agent.ts:531-854` | `newSession`, `openSession`, `parkCurrentRun`, `adoptParked`, `startBridgeAt`, `restartBridgeAt`, `syncCwdToSession`, `switchAndLoad`, `loadTranscript`, `deleteSession`, `confirmInterrupt` | `store/session.ts` (a fatia mais densa: 324 linhas, 3 caminhos de troca de sessao) |
| `agent.ts:856-990` | `plainText`, `generateTitleFor`, `generateTitlesFor`, `maybeGenerateTitle`, flag `titling` | `store/titles.ts` |
| `agent.ts:992-1023` | `observeSession`, `unobserveSession` | `store/observe.ts` |

Notas de acoplamento que a fatia deve preservar:

- `agent.ts:217` e `:231` chamam `refreshContext()` de dentro do `ingest` - o store
  depende do modulo de RPC. Manter `rpc.ts` sem importar o store e injetar via
  `useAgent.getState()` como ja e feito (`agent.ts:318`) evita ciclo.
- `agent.ts:954` guarda estado de modulo (`let titling`) fora do store; ao mover
  para `titles.ts` esse escopo continua correto.
- `agent.ts:532` e `:568` (`confirmInterrupt`) pertencem a `session.ts`, mas
  `BranchPicker.tsx:84-93` faz a MESMA decisao ("streaming? pede confirmacao")
  na mao. Ao extrair, exportar `confirmInterrupt(onProceed, extra?)` e reusar la.

Sugestao pratica: manter `store/agent.ts` como barrel (`export * from './session'` etc.)
para nao tocar em 40 imports de componentes numa unica PR.

---

## 3. `window.prime` direto no JSX / componentes

**Severidade: MEDIO a ALTO conforme o caso**

Contagem por arquivo (grep `window.prime`): `AccountBadge.tsx` 11, `Onboarding.tsx` 9,
`TerminalView.tsx` 6, `FilesPanel.tsx` 4, `FileViewer.tsx` 4, `Composer.tsx` 3,
`TerminalPanel.tsx` 3, `BranchPicker.tsx` 2, `DiffPanel.tsx` 2, `MicButton.tsx` 2,
`Welcome.tsx` 2, `AgentTree.tsx` 1, `Markdown.tsx` 1, `SchedulesPanel.tsx` 1, `SshModal.tsx` 1.

Nem todo caso e problema. Classificacao:

### 3.1 Estado de execucao duplicado (ALTO)

- `components/Composer.tsx:180-188` - `ContextChips` mantem `useState execution` e
  chama `window.prime.execution()` num efeito com dep `[cwd]`.
- `lib/useExecutionTarget.ts:45-67` - o hook que TROCA o destino nao expoe o destino atual.
- `store/agent.ts:743` - `syncCwdToSession` consulta `window.prime.execution()` de novo
  para decidir se pode reiniciar a ponte.

Tres leitores da mesma verdade, nenhum dono. Efeito real: trocar de destino por
`exec.use()` (`App.tsx:149`) so atualiza o chip porque `cwd` muda; se o `cwd`
permanecer igual, o chip fica desatualizado ate a proxima troca de diretorio.

Correcao: mover `execution` para o store (`execution: { kind: 'local' | 'ssh'; target?: string } | null`
+ `setExecution`), com `refreshExecution(): Promise<void>` em `store/session.ts`
chamado apos `startBridgeAt`/`restartBridge`. `ContextChips` passa a `useAgent((s) => s.execution)`
e perde o `useEffect`; `syncCwdToSession` le do store.

### 3.2 Leitura de arquivo no componente, sem `useAsync` (MEDIO)

- `components/FilesPanel.tsx:36-45` - `Node` reimplementa `loading` + `children` na mao e
  ENGOLE o erro (`r?.ok ? entries : []`), ou seja, pasta ilegivel aparece como pasta vazia.
  O proprio `lib/useAsync.ts:5-9` cita este no como motivo de existir ("sem `error` no no da
  arvore de arquivos"). O mesmo arquivo ja usa `useAsync` + `unwrap` na raiz (`FilesPanel.tsx:153-162`).
- `components/FileViewer.tsx:39-79` - maquina de tres estados na mao (`state`, `error`,
  `content`, `original`, `meta`, `saving`), com `window.prime.readFile` e `writeFile` inline.

Correcao: `Node` usa `useAsync<DirEntry[]>(() => unwrap(window.prime.listFiles(entry.path), r => r.entries as DirEntry[], t('files.nothing')), [entry.path], { immediate: false })`.
Para o visor, extrair `lib/useFileDocument.ts`:
`useFileDocument(path: string): { content, setContent, original, meta, state, error, dirty, save(): Promise<void>, reload(): Promise<void> }`,
deixando o componente so com `editing`/render.

### 3.3 Chamadas de "ergonomia de painel" - aceitaveis (CORRETO, com ressalva BAIXO)

- `AgentTree.tsx:176` (`refreshAgentTree`), `FilesPanel.tsx:103` / `FileViewer.tsx:157,197`
  (`revealFile`), `Markdown.tsx:12` (`openExternal`), `TerminalView.tsx:70-99` (PTY),
  `BranchPicker.tsx:44,63` (git, com justificativa explicita em `BranchPicker.tsx:20-25`),
  `DiffPanel.tsx:64,79` (ja passa por `unwrap`).
  Sao comandos sem estado global, ligados ao ciclo de vida do painel. Estao corretos.
- Ressalva BAIXO: `AgentTree.tsx:176` chama `window.prime.refreshAgentTree()` no `onClick`
  enquanto `store/agent.ts:378` ja exporta `refreshTree()` para exatamente isso. Trocar
  por `refreshTree` remove um acesso cru a bridge de dentro do JSX.

### 3.4 Ausencia de `unwrap` (BAIXO)

`lib/ipc.ts:17` existe para padronizar `{ ok, error }`, mas so `DiffPanel.tsx:64,79` e
`FilesPanel.tsx:157` usam. Os demais repetem `if (!r?.ok)` a mao (ex.: `FileViewer.tsx:53`,
`BranchPicker.tsx:45`, `MicButton.tsx:76`, `Onboarding.tsx:63`). Nao e bug; e a divergencia
de estilo que o proprio `ipc.ts:4-8` descreve. Padronizar quando o arquivo for tocado.

---

## 4. Duplicacao de logica pura que deveria estar em `lib/`

### 4.1 "Achatar blocos de conteudo em texto" - 3 copias (MEDIO)

- `store/agent.ts:858-864` (`plainText(m: UiMessage)`)
- `store/agent.ts:896-904` (`flat(m: AgentMessage)`, dentro de `generateTitleFor`)
- `components/Message.tsx:63-66` (filtro + map + join no JSX)

Correcao: `lib/blocks.ts` com
`export function textOfBlocks(content: ContentBlock[] | string): string` e
`export function plainText(m: { content: ContentBlock[] | string }): string`.
Os tres pontos passam a chamar a mesma funcao.

### 4.2 "Tem conteudo visivel?" - 2 copias (MEDIO)

- `lib/pending.ts:21-26` (dentro de `awaitingFirstBlock`)
- `components/Message.tsx:126-131` (`hasVisibleContent`)

Predicado identico (texto nao vazio, thinking nao vazio ou `toolCall`). Divergir
uma delas cria bolha de atividade e mensagem vazia ao mesmo tempo.
Correcao: exportar `hasVisibleContent(blocks: ContentBlock[]): boolean` de `lib/blocks.ts`
e consumir nos dois.

### 4.3 Nome curto do diretorio - 2 copias (BAIXO)

- `components/Composer.tsx:190-194` (`short`: `cwd === home ? 'Home' : ultimo segmento`)
- `lib/grouping.ts:13-18` (`projectOf(cwd, home)`: mesma regra, com `'Sem projeto'`/`'Raiz'`)

Existe ainda `lib/format.ts:91` (`shortPath`). Correcao: `ContextChips` usa
`projectOf(cwd, home)`; se o rotulo "—" para vazio importa, `projectOf` ganha
parametro `fallback`.

### 4.4 Custo formatado com regra propria (BAIXO)

- `components/Message.tsx:195` - `` `$${msg.usage.cost.total.toFixed(4)}` `` inline,
  enquanto `lib/format.ts:7` (`fmtCost`) usa 2 casas e trata `<$0.01`.

Duas escalas de dinheiro na mesma tela. Correcao: `fmtCost(n: number, digits = 2)`
em `format.ts` e usar `fmtCost(total, 4)` no rodape da mensagem.

### 4.5 Extensao de arquivo / linguagem - 3 copias (BAIXO)

- `components/Composer.tsx:615` - `baseName(a.path).split('.').pop()`
- `components/FilesPanel.tsx:14-24` - conjuntos `CODE`/`DATA`/`IMG` + `name.split('.').pop()`
- `components/FileViewer.tsx:10-25` - `LANG_BY_EXT` + `langOf(path)`

Correcao: `lib/fileKind.ts` com `extOf(path: string): string`,
`kindOf(path: string): 'code' | 'data' | 'image' | 'text'` e `langOf(path): string | null`.
Os tres componentes passam a consumir.

---

## 5. Comportamento de React duplicado que ja tem hook em `lib/`

### 5.1 Rolagem colada ao fim, feita a mao (MEDIO)

- `components/ObservedPanel.tsx:44-45,67-77,170-173` - `scroller`, `pinned`, efeito de
  colar no fim e `onScroll` com folga `90` literal.
- `lib/useStickyScroll.ts:22` - a mesma folga ja existe como `STICK_SLACK = 90`, e o hook
  resolve tambem o caso de imagem/realce que reflowa (`useStickyScroll.ts:14-18`).

Correcao: `ObservedPanel` usa
`useStickyScroll({ sessionId: activeSessionId, loadingSession: false, messageCount: transcript.messages.length, sticksOn: [transcript.messages, transcript.tools] })`.
Se a assinatura ficar forcada, extrair de dentro do hook um `usePinnedScroll(sticksOn)`
menor e usar nos dois.

### 5.2 Lista filtrada com cursor de teclado - 2 copias (MEDIO)

- `components/Composer.tsx:361-374` (filtro/ordenacao) + `:414-437` (ArrowUp/ArrowDown/Enter/Tab/Escape)
- `components/CommandPalette.tsx:28-50` (filtro) + `:54-72` (mesmas teclas, com `%` e clamp)

Correcao: `lib/useListCursor.ts` -
`useListCursor<T>(items: readonly T[]): { cursor: number; setCursor: (i: number) => void; onKeyDown: (e: React.KeyboardEvent, onPick: (item: T) => void) => boolean }`,
devolvendo `true` quando consumiu a tecla. Os dois componentes ficam so com o render.

### 5.3 "Copiado!" por 1600 ms - 3 copias (BAIXO)

- `components/Markdown.tsx:28`, `components/DocumentPanel.tsx:28`, `components/Onboarding.tsx:162`

Correcao: `lib/useCopyFeedback.ts` -
`useCopyFeedback(ms = 1600): { copied: boolean; copy: (text: string, failMessage: string) => Promise<void> }`,
encapsulando `copyText` de `lib/clipboard.ts` e o `setTimeout` (que hoje nao e limpo
no unmount em nenhuma das tres copias).

### 5.4 Preferencia em `localStorage` no componente (BAIXO)

- `components/Composer.tsx:291-297` - `prime-desk:delivery` lido e gravado dentro do componente.
- Comparar com `lib/useZoom.ts:15,31`, `lib/useResizable.ts:24,35`, `lib/useMicrophone.ts:23,177`,
  que encapsulam a mesma mecanica em hooks.

Correcao: `lib/usePreference.ts` -
`usePreference<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void]`,
e `Composer` passa a `usePreference('prime-desk:delivery', 'steer', ['steer','followUp'])`.

---

## 6. Regra de negocio dentro de componente

### 6.1 Composer acumula quatro responsabilidades (MEDIO)

`components/Composer.tsx` tem 725 linhas e concentra:

- anexos: `fileToAttachment` (`:47-67`), `addFiles` (`:453-475`), `onPaste` (`:477-484`),
  `attach` (`:486-499`), limite `MAX_IMAGE_BYTES` (`:39`) e `window.prime.pathForFile` (`:467`);
- menu de barra: `detectSlash` (`:340-346`), `syncSlash` (`:348-359`), `slashItems` (`:361-374`),
  `applyCommand` (`:376-389`);
- envio: `submit` (`:391-412`);
- ditado: `dictationBase` (`:308-314`) + merge em `:690-695`.

Correcao (extracao, sem mudar comportamento):

- `lib/useAttachments.ts` - `useAttachments(): { atts, add(list: FileList | File[]): Promise<void>, pick(): Promise<void>, removeAt(i: number): void, clear(): void, split(): { files: string[]; images: {data,mimeType}[] } }`.
  Leva junto `fileToAttachment` e `MAX_IMAGE_BYTES` (regra de dominio, nao de layout).
- `lib/useSlashMenu.ts` - `useSlashMenu(commands, textarea): { slash, items, cursor, setCursor, sync(): void, apply(item): void, onKeyDown(e): boolean }`,
  sobre o `useListCursor` do item 5.2. `detectSlash` vira funcao pura testavel em `lib/slash.ts`.
- O ditado pode ficar: `joinDictation` ja e util puro (`lib/attachments.ts:68`) e o `ref` de base
  e detalhe de UI. **Correto como esta.**

### 6.2 `ContextChips` dentro do Composer (BAIXO)

`components/Composer.tsx:161-250` - subcomponente com IPC e menu proprio no mesmo arquivo do
composer. Depois de mover `execution` para o store (item 3.1), extrair para
`components/ContextChips.tsx` deixa `Composer.tsx` perto de 400 linhas.

### 6.3 Confirmacao de troca de ramo (BAIXO)

`components/BranchPicker.tsx:84-96` reimplementa a regra "se esta streaming, peca confirmacao",
que ja existe em `store/agent.ts:568-584` (`confirmInterrupt`, privado do modulo).
Correcao: exportar `confirmInterrupt` na fatia `store/session.ts` e reusar.

---

## 7. Acoplamento entre componentes irmaos

### 7.1 Recados por store: **correto**

`store/agent.ts:78-93` (`terminalRequest`, `dockRequest`) resolvem comunicacao entre
`AccountBadge` -> `TerminalPanel` e `QueuePopover` -> `AgentTree`, com o porque escrito.
`lib/useDock.ts:44-53` consome e limpa. E a solucao certa para irmaos distantes.

### 7.2 Props de arquivo em cascata (BAIXO)

`App.tsx:56-58,169-170` guarda `openFile` e `fileDraft`, que descem por
`DockHost.tsx:24-25` ate `FilesPanel` (`DockHost.tsx:31`) e sobem de volta para o
`Composer` via `draft`/`onDraftConsumed` (`App.tsx:154-155`, `Composer.tsx:328-333`).
Sao dois saltos, e o App e o dono - ainda dentro do padrao documentado
(`App.tsx:33-36`). Aceitavel; se ganhar um terceiro consumidor, virar
`store.composerDraft` no mesmo molde de `dockRequest`.

### 7.3 `SshConnection` viajando entre irmaos (ver item 1)

`Composer.tsx:18` define, `App.tsx:150` repassa, `useExecutionTarget.ts:2` importa,
`SshModal.tsx` define `SshForm`. Resolvido pelo `lib/types.ts` do item 1.

---

## 8. O que esta correto e nao deve ser mexido

- `store/transcript.ts` - reducer puro, sem React e sem IPC, com `applyEvent` reusado pela
  sessao propria e pelas observadas (`transcript.ts:38-49`, usado em `agent.ts:206` e `:270`).
  Separacao exemplar.
- `lib/useTurnActivity.ts:134` (`stallOf`) - decisao pura separada do hook, justamente para
  ser testavel. O relogio compartilhado (`:48-65`) evita N timers.
- `lib/useAsync.ts` - abstracao correta de carga assincrona, com epoca e `keepPrevious`.
- `lib/usePopover.ts` - captura de Escape com `stopPropagation` documentada (`:11-15`),
  coerente com `useAppShortcuts.ts:34`.
- `lib/schedule.ts` - valida forma e nao reimplementa cron (`schedule.ts:12-15`): respeita
  "GUI e cliente fino".
- `App.tsx` - so composicao; todos os modais no nivel do App, como manda o CONTRIBUTING.
- `components/Transcript.tsx`, `components/DockHost.tsx`, `components/PanelState.tsx` - puros
  de apresentacao, sem efeito colateral.
- `lib/format.ts`, `lib/grouping.ts`, `lib/toolSummary.ts`, `lib/agentUsage.ts`,
  `lib/agentMessage.ts`, `lib/attachments.ts`, `lib/greeting.ts` - funcoes puras, sem React.

---

# Parte II - Componentes grandes (leitura delegada, evidencias conferidas por amostragem)

Verificado por amostragem no codigo: `AccountBadge.tsx:9-12`, `Onboarding.tsx:11-14`,
`SchedulesPanel.tsx:46-48,231,233`, `SessionMenu.tsx:87-96,99-111`,
`TerminalPanel.tsx:43-44,64-87,114-119`, `DockHost.tsx:17-18,34-35`.

## 9. Ambiente/autenticacao sem dono, duplicado entre irmaos

**Severidade: ALTO**

- `components/AccountBadge.tsx:9-12` e `components/Onboarding.tsx:11-14` declaram o MESMO
  tipo `EnvStatus`, cada um por conta propria.
- Os dois assinam o mesmo canal e o mesmo watcher: `AccountBadge.tsx:100-107` e
  `Onboarding.tsx:88-107` (`onboarding:env`, `watchEnvironment`, `unwatchEnvironment`).
- `lib/useBridge.ts:107` consulta `checkEnvironment()` uma terceira vez no boot.
- `AccountBadge.tsx:33-45,83-97,137` faz `checkEnvironment`, `appInfo`, `checkAgentUpdate`,
  `rescanAgent`, `logoutProvider` com `r?.ok` na mao e cast (`r.status as EnvStatus`).
- `Onboarding.tsx:62,76,88,98,104,124,141,147` repete o padrao.
- A derivacao de estagio (`!installed -> install`, `!auth.ok -> auth`, senao `ready`) aparece
  duas vezes no mesmo arquivo: `Onboarding.tsx:68-71` e `:90-96`.

Correcao:

- `EnvStatus` vai para `src/shared/protocol.ts` (dado do main, nao da tela).
- `lib/useEnvironment.ts` - assinante unico:
  `useEnvironment(): { status: EnvStatus | null; update: AgentUpdate | null; userName: string; refresh(): Promise<void>; install(): Promise<void>; openTerminal(): Promise<{ portBusy?: number; error?: string }> }`,
  usando `unwrap` de `lib/ipc.ts`.
- `lib/env.ts` puro: `stageFor(s: EnvStatus): Stage`, `providerLabel(provider, envKey): string`
  (hoje inline em `AccountBadge.tsx:122`), `envDetail(status, t): string` (hoje em `Onboarding.tsx:195-214`).
- `logoutProvider(provider)` vira comando de store, no molde de `compactNow` (`store/agent.ts:527`).

## 10. TerminalPanel: abas em estado local de um painel que e desmontado

**Severidade: ALTO**

- `components/TerminalPanel.tsx:43-44` guarda `tabs`/`active` em `useState`.
- `components/DockHost.tsx:34-35` monta o painel apenas quando `dock === 'terminal'`;
  fechar o dock desmonta.
- `components/DockHost.tsx:17-18` afirma o contrario: "O TerminalPanel preserva as abas
  internamente". O contrato documentado nao corresponde ao codigo.
- `TerminalPanel.tsx:114-119` so mata o PTY em `closeTab`. Fechar o dock nao chama
  `killTerminal`: o processo fica no main sem superficie.

Correcao: `tabs`/`activeTab` no store (`terminalTabs: Tab[]`, `activeTab: string`,
acoes `addShellTab`, `openFileTab(path)`, `closeTab(id)`), consumidos por
`lib/useTerminalTabs.ts`. O `killTerminal` passa a ser responsabilidade da acao de store,
que tambem pode encerrar tudo ao fechar o dock.

Achado ligado (MEDIO): `TerminalPanel.tsx:64-87` executa
`void window.prime.writeTerminal(...)` e `setActive(...)` DENTRO do updater de `setTabs`.
Updater deve ser puro; em StrictMode/rebase o React pode reexecuta-lo e o comando seria
digitado duas vezes. Calcular o alvo fora e disparar o RPC no efeito.

## 11. SchedulesPanel assina `agent:event` por fora do `useBridge`

**Severidade: ALTO**

- `components/SchedulesPanel.tsx:137-147` registra um segundo `window.prime.on('agent:event', ...)`.
- `lib/useBridge.ts:9-19,37` documenta ser o assinante unico, registrado antes do
  `startBridge` justamente para nao perder evento.

Dois assinantes do mesmo canal significam duas politicas de filtro (o painel nao aplica a
guarda de `bridgeId` de `useBridge.ts:50-51`, entao evento de ponte estacionada tambem
recarrega a lista).

Correcao: fanout no store - `lib/useAgentEvent.ts` com
`useAgentEvent(type: string, cb: (ev: AgentEvent) => void): void`, alimentado pelo
`ingest`; ou um contador `heartbeatsRev` no store usado como dependencia do `useAsync`.

Achados ligados no mesmo arquivo:

- **MEDIO/ALTO** - `SchedulesPanel.tsx:231`: `/daemon/i.test(data.error)` decide a UI a partir
  do TEXTO do erro do servidor. Correcao: `RpcOutcome` (`store/agent.ts:284-288`) ganha
  `code?: string` e `lib/schedule.ts` expoe `isNoDaemon(outcome): boolean`.
- **MEDIO** - `SchedulesPanel.tsx:46-48` (`isFinished`) e `:233` (`j.source !== 'heartbeat'`)
  sao regra do agente. Mover para `lib/schedule.ts`: `isFinished(job)`,
  `splitJobs(jobs): { jobs: AgentCronJob[]; heartbeat: AgentCronJob | null }`.
- **MEDIO** - `SchedulesPanel.tsx:109-118` duplica o par `schedule`/`prompt` (formulario e
  heartbeat) e `:312,:453` recalculam `parseSchedule(...).ok` no JSX. Correcao:
  `lib/useScheduleDraft.ts` - `useScheduleDraft(initial: string): { value; setValue; parsed; valid }`.
- **BAIXO** - `SchedulesPanel.tsx:114` (`warned`) reaparece a cada remontagem do painel;
  pertence ao store.

## 12. Sidebar: mutacao de `FolderState` espalhada por 7 blocos de JSX

**Severidade: ALTO**

- `components/Sidebar.tsx:60-65` (titulo), `:207-210` (renomear pasta),
  `:215-221` (remover pasta + limpar `assignments`), `:230-233` (atribuir sessao),
  `:400-404` (criar pasta, com id gerado no JSX: `'f' + Date.now().toString(36)`),
  `:446-449` (colapso).
- `components/SessionMenu.tsx:57-63,67-75,77-85,99-111` (pin, arquivar, atribuir, esquecer).

Cada bloco faz spread manual de `assignments`/`pinned`/`archived`/`titles` e chama
`mutateFolders` (`store/agent.ts:388`). E o mesmo dominio replicado em nove lugares.

Correcao: `lib/folders.ts` com funcoes PURAS sobre `FolderState`
(`assign(state, sessionId, folderId | null)`, `togglePin(state, id)`,
`toggleArchive(state, id)`, `setTitle(state, id, name)`, `createFolder(state, name)`,
`renameFolder(state, id, name)`, `removeFolder(state, id)`,
`toggleCollapsed(state, key)`, `forgetSession(state, id)`), mais wrappers de comando em
`store/` que chamam `mutateFolders(fn)`. `forgetSession` passa a ser chamada por
`deleteSession` (`store/agent.ts:835`) em vez de pelo menu.

## 13. Outros achados dos componentes grandes

### MEDIO

- `components/Sidebar.tsx:353-369` - walk recursivo em `tree.roots` e derivacao de
  `runningPaths` a partir de `parkedRuns` dentro do componente. Sao seletores de dominio:
  mover para o store ou `lib/grouping.ts` (`sessionIdsInUse(tree, activeId): Set<string>`,
  `runningSessionPaths(parkedRuns): Set<string>`).
- `components/Sidebar.tsx:420-443` (`titleAll`) - orquestra confirmacao, progresso e
  tratamento de falha do lote de titulos; ja tem dois consumidores do mesmo estado
  (`:512-533` e `:562-575`). Extrair `lib/useTitling.ts` -
  `useTitling(): { progress: { done: number; total: number } | null; start(sessions: readonly SessionSummary[]): void; cancel(): void }`
  sobre `generateTitlesFor` (`store/agent.ts:935`).
- `components/Sidebar.tsx:68-84` e `:251-262` - edicao inline (`draft`, Enter/Escape/blur)
  duplicada. Extrair `components/InlineEdit.tsx` ou `lib/useInlineEdit.ts`.
- `components/Sidebar.tsx:383,616` -> `components/SessionMenu.tsx:128` - a prop `groups`
  atravessa `SessionRow`, que nao a usa, so para o menu filtrar `kind === 'folder'`.
  Correcao: o menu ja le `folders` do store (`SessionMenu.tsx:29`); derivar la com
  `folderGroups(folders)` e remover a prop.
- `components/SessionMenu.tsx:89` - `rpc('clone')` cru no componente, enquanto todas as
  outras acoes do mesmo menu usam comandos do store. Correcao:
  `export async function cloneSession(): Promise<boolean>` em `store/session.ts`, com o
  `notify` dentro.
- `components/AccountBadge.tsx:125-147` - regra "chave de ambiente nao desloga" + chamada +
  notificacao no componente. Vira comando de store.
- `components/MicButton.tsx:60,74-81` - carga assincrona reimplementada onde `lib/useAsync.ts`
  serve. Correcao: `lib/useSpeechStatus.ts` devolvendo `Async<SpeechStatus>` + `install(modelId)`.
- `components/MicButton.tsx:88-103` - `speechSetupCommand` + montagem do `detail` no
  componente; parte RPC vai para o hook com `unwrap`, `requestConfirm` fica no componente.
- `components/StatusBar.tsx:146` - `export type Dock` no componente (ver achado 1).
- `components/QueuePopover.tsx:144` - `requestDock('agents')` com `kind: string`
  (`store/agent.ts:132`): typo nao quebra build. Tipar como `Exclude<Dock, null>` depois de
  mover `Dock` para `lib/`.

### BAIXO

- `components/Onboarding.tsx:150` - `'Falha ao abrir terminal.'` e
  `components/SessionMenu.tsx:90,92` - `'Nao foi possivel duplicar esta conversa.'` /
  `'Conversa duplicada.'`: strings fora do `t()` num app que e todo i18n.
- `components/AccountBadge.tsx:282` - escolha de frase por `lang === 'pt' ? ... : 'es' ? ...`
  dentro do JSX; deveria ser chave de i18n.
- `components/AccountBadge.tsx:122` - `envKey.replace('_API_KEY','').toLowerCase()` inline.
- `components/TerminalPanel.tsx:106` - `path.split('/').pop() ?? path`; usar `baseName`
  de `lib/attachments.ts:58` (ou mover para `lib/format.ts`).
- `components/TerminalPanel.tsx:29-30` - `let seq` mutavel em modulo de UI; mover para `lib/ids.ts`.
- `components/StatusBar.tsx:206-210` - resolve titulo com `folders.titles[id] ?? sessions.find(...)`,
  regra que `lib/grouping.ts:21-25` (`withTitles`) ja tem. Extrair `sessionTitle(...)`.
- `components/StatusBar.tsx:24-25,96` - limiares `> 80` / `> 55` repetidos. Extrair
  `contextTone(pct: number | null)` para `lib/format.ts`.
- `components/QueuePopover.tsx:197,203` - `?? 'one-at-a-time'` repetido; expor default no store.
- `components/Sidebar.tsx:330,388-393` - `busy` global desabilita a lista inteira durante
  `openSession`; melhor `busySessionPath` no store.
- `components/Sidebar.tsx:572` - `Math.round((done / total) * 100)` no JSX; `fmtPercent(done, total)`
  em `lib/format.ts` evita `NaN` com `total === 0`.
- `components/MicButton.tsx:72` - `models.filter(present).at(-1)` e regra ("melhor = maior
  baixado"); extrair `bestSpeechModel(status)`.
- `components/MicButton.tsx:9-16` - `SpeechModel`/`SpeechStatus` definidos no componente para
  dado que vem do main; mover para `shared/protocol.ts`.
- `components/SessionMenu.tsx:30,45` - dois caminhos para o mesmo `notify` (selector e
  `useAgent.getState()`); padronizar.
- `components/Onboarding.tsx:61-73` - `check` usa `t` mas declara `[]` no `useCallback`.

### Correto nestes arquivos

- `requestConfirm` / `ConfirmDialog` do store em `Sidebar.tsx:423`, `SchedulesPanel.tsx:158,406`,
  `SessionMenu.tsx:115`, `AccountBadge.tsx:56`, `BranchPicker.tsx:85`: dialogo unico no App,
  como manda o CONTRIBUTING.
- `requestTerminal` / `terminalRequest` (`AccountBadge.tsx:63` -> `useDock.ts:44` ->
  `TerminalPanel.tsx:62`): recado por store entre irmaos distantes, com o porque escrito
  em `store/agent.ts:78-85`.
- `SchedulesPanel.tsx:124-135` usa `useAsync` com `pollMs`; `Sidebar.tsx:341-342` usa
  `useResizable`/`useIsMac`; `SessionMenu.tsx:52` usa `usePopover`; `QueuePopover` usa
  `parseQueueItem`/`countWorking` de `lib/agentMessage.ts`. Reuso correto da camada `lib/`.
- `StatusBar.tsx` nao tem nenhuma chamada a `window.prime` e formata tudo por `lib/format.ts`.

---

# Resumo por severidade

| Severidade | Qtde | Achados |
|---|---|---|
| ALTO | 7 | 1 (lib -> components), 2 (fatiar `store/agent.ts`), 3.1 (`execution` sem dono), 9 (ambiente/auth duplicado), 10 (abas do terminal + PTY vazado), 11 (segundo assinante de `agent:event`), 12 (mutacao de `folders` espalhada) |
| MEDIO | 19 | 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 8 (regex `/daemon/i`), `isFinished`/`splitJobs`, `useScheduleDraft`, seletores da arvore na Sidebar, `titleAll`, `InlineEdit`, prop `groups`, `rpc('clone')`, logout no AccountBadge, `useSpeechStatus`, `speechSetupCommand`, `Dock` exportado do StatusBar, `requestDock(string)`, `writeTerminal` dentro do updater |
| BAIXO | 21 | 3.3 (ressalva `refreshTree`), 3.4 (`unwrap` nao padronizado), 4.3, 4.4, 4.5, 5.3, 5.4, 6.2, 6.3, 7.2, `warned`, strings fora do i18n (3x), `envKey` inline, `basename` no TerminalPanel, `let seq`, `sessionTitle`, `contextTone`, default de `QueueMode`, `busy` global, `fmtPercent`, `bestSpeechModel`, tipos de fala no componente, `notify` em dois caminhos, deps do `check` |

## Ordem sugerida de execucao

1. `lib/types.ts` (`Dock`, `SshConnection`, `SshForm`) e `EnvStatus` para `shared/protocol.ts` - mecanico, destrava o resto.
2. `lib/useEnvironment.ts` + `lib/env.ts` - remove 20 chamadas cruas a `window.prime` e a duplicacao AccountBadge/Onboarding.
3. Abas do terminal no store, com `killTerminal` no fechamento do dock - e o unico achado com vazamento de recurso.
4. `lib/folders.ts` - tira regra de dados de nove blocos de JSX.
5. Fatiar `store/agent.ts` mantendo um barrel, em PR isolada, sem outra mudanca junto.
6. `lib/blocks.ts`, `lib/fileKind.ts`, `lib/useCopyFeedback.ts`, `lib/useListCursor.ts` - deduplicacao barata.

> Relatorio de auditoria: leitura de codigo, sem alteracao. Recomendacoes exigem revisao humana e validacao por par antes de qualquer refatoracao.
