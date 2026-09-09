# Auditoria — Componentização (escopo 1)

Escopo: `src/renderer/src/App.tsx` e os componentes grandes
(`Composer`, `Sidebar`, `SchedulesPanel`, `Onboarding`, `StatusBar`,
`AccountBadge`, `MicButton`, `FilesPanel`, `FileViewer`, `TerminalPanel`).
Referências lidas: `CONTRIBUTING.md`, `docs/REDESIGN.md` §2, §3.4–§3.9, §4.
Nenhum arquivo de código foi alterado.

Resumo por severidade: **ALTO 4 · MÉDIO 7 · BAIXO 4**.

---

## O que está correto (verificado, não presumido)

- **Nenhum subcomponente é declarado dentro de outro componente.**
  `SessionRow`/`GroupHeader` (Sidebar.tsx:31, :190), `ExecutionMenu`/`ContextChips`
  (Composer.tsx:77, :161), `StatusBadge`/`ScheduleField` (SchedulesPanel.tsx:50, :70),
  `ContextRing`/`MetricsPopover`/`ToolButton` (StatusBar.tsx:19, :53, :149),
  `StepRow` (Onboarding.tsx:18), `LevelMeter` (MicButton.tsx:31), `FileIcon`/`Node`
  (FilesPanel.tsx:18, :34) estão todos no escopo do módulo. A varredura por
  declarações de componente aninhadas achou só `UsagePanel.tsx:41`, que é um array
  de rótulos, não componente. Não há problema de remontagem por identidade nova
  de tipo.
- **`App.tsx` cumpre o papel declarado** no próprio comentário (App.tsx:26–36):
  187 linhas, sem lógica própria, cada comportamento num hook
  (App.tsx:39–52) e composição de layout no JSX. Os modais vivem aqui:
  `palette`, `sshModal`, `openFile`, `fileDraft` (App.tsx:54–58), renderizados no
  nível raiz (App.tsx:173–184). É exatamente o padrão do CONTRIBUTING.
- **`ConfirmDialog` como diálogo único por store** (`requestConfirm`) está bem
  aplicado nos componentes do escopo: Sidebar.tsx:423, SchedulesPanel.tsx:158/189/406,
  AccountBadge.tsx:56/131, MicButton.tsx:96. Nenhum deles inventa um "tem certeza?"
  próprio.
- **`DockHost` como switch de painel único** (DockHost.tsx:28–44) e `Transcript`
  (Transcript.tsx:30–96) estão no tamanho e na responsabilidade certos.
- **`FileViewer` e `TerminalPanel`** estão coesos: o `active` do FileViewer
  (FileViewer.tsx:27–37, :82) existe justamente porque `TerminalPanel` mantém abas
  montadas (TerminalPanel.tsx:201–224) — a razão está comentada nos dois lados.

---

## ALTO

### A1. `Composer.tsx` acumula seis responsabilidades num componente de 473 linhas
**Evidência:** Composer.tsx:252–725 (o componente `Composer` em si). Dentro dele:
anexos (`fileToAttachment` :47, `addFiles` :453, `onPaste` :477, `attach` :486,
chips de anexo no JSX :594–630), menu de comandos slash (`detectSlash` :340,
`syncSlash` :348, `slashItems` :361, `applyCommand` :376, teclado :414–437),
auto-resize do textarea (:316–321), base de ditado (:308–314, :689–696), fila de
entrega (:291–299, :519–556) e o envio (:391–412). São 9 `useState`/`useRef`
(:274–299) e 4 `useEffect`.

**Correção proposta:**
1. `lib/useAttachments.ts` → `useAttachments(): { atts, addFiles, addPicked, remove, clear, toPrompt }`, levando `fileToAttachment`, `MAX_IMAGE_BYTES`, `addFiles`, `attach` e o tipo `Attachment`.
2. `lib/useSlashCommands.ts` → `useSlashCommands(ta: RefObject<HTMLTextAreaElement>, value: string, setValue): { slash, items, cursor, setCursor, sync, apply, onKeyDown }`, levando :335–443.
3. `components/composer/AttachmentStrip.tsx` → `({ items, onRemove }: { items: Attachment[]; onRemove: (i: number) => void })`, levando :594–630.
4. `components/composer/QueueBar.tsx` → `({ queued, streaming, delivery, onDelivery }: …)`, levando :519–556.
5. `lib/useAutoGrow.ts` → `useAutoGrow(ref, value, max = 260)`, levando :316–321.
Sobra um `Composer` de ~180 linhas: caixa, barra de controles e envio.

### A2. Cadeia de props de execução atravessa três níveis e duplica a fonte da verdade
**Evidência:** `App.tsx:148–153` passa `onPickCwd`, `onSetExecution`, `connections`,
`onOpenSshModal`, `onRemoveConnection`, `home` para o `Composer`; o `Composer`
(:262–272) apenas os repassa para `ContextChips` (:505–512), que repassa para
`ExecutionMenu` (:217–235). Nenhum desses seis props é usado pelo `Composer`.
Pior: o estado real do destino é buscado por IPC dentro do `ContextChips`
(Composer.tsx:180–188 `window.prime.execution()`), enquanto `useExecutionTarget`
(lib/useExecutionTarget.ts:31–119), que já é o dono das conexões e do `use()`,
não conhece esse estado. São duas fontes para o mesmo fato.

**Correção proposta:** mover a leitura de `window.prime.execution()` para
`useExecutionTarget`, expondo `execution: { kind, target }` no `ExecutionTarget`
(useExecutionTarget.ts:19–29); extrair `components/composer/ContextChips.tsx` e
`ExecutionMenu.tsx` e renderizar `<ContextChips … />` direto no `App.tsx`, acima
do `<Composer />` (App.tsx:144–157). O `Composer` fica com 3 props
(`onOpenPalette`, `draft`, `onDraftConsumed`).

### A3. `Sidebar.tsx` mistura cromo, busca, lote de títulos e lista
**Evidência:** Sidebar.tsx:313–653 — 8 estados (:329–341), 5 `useMemo`
(:344–418), 4 handlers assíncronos (:388–450) e, no JSX: barra de título
(:463–471), bloco de ações com 5 botões (:478–543), busca (:545–555), progresso
do lote (:562–575), lista com paginação por grupo (:577–642) e rodapé (:644).

**Correção proposta:** quebrar em
`components/sidebar/SidebarHeader.tsx`, `SidebarActions.tsx`
(`{ untitled, titling, archivedCount, showArchived, onToggleArchived, onNewFolder, onTitleAll }`),
`SidebarSearch.tsx` (`{ value, onChange }`), `TitlingProgress.tsx` (`{ done, total }`)
e `SessionList.tsx` (`{ groups, activeId, busy, inUseIds, runningPaths, onOpen }`),
movendo `titleAll` (:420–443) para `lib/useTitleBatch.ts`
(`useTitleBatch(untitled): { titling, run }`). `Sidebar` fica com ~120 linhas de
composição e o `useResizable`.

### A4. `Button` do Modal não compõe `className` e já é burlado
**Evidência:** Modal.tsx:202–205 — `className={base + style}` é escrito **antes**
de `{...rest}`, então um `className` externo apaga toda a base do primitivo.
`ConfirmDialog.tsx:47–52` explora isso para pintar o botão de perigo com a classe
inteira à mão. Onboarding.tsx:250–269 e :392–397 contornam por outro lado,
embrulhando `<span className="flex items-center gap-1.5">` dentro do `Button` só
para ter ícone.

**Correção proposta:** em `Modal.tsx`, (a) adicionar `variant='danger'`
(`border border-err/40 bg-err/15 text-err hover:bg-err/25`), (b) aceitar
`icon?: ReactNode` e renderizar `flex items-center gap-1.5` internamente, e
(c) mesclar classes: `className={[base, style, rest.className].filter(Boolean).join(' ')}`
com `rest.className` removido do spread. Depois, apagar o override em
`ConfirmDialog.tsx:47–52` e os `span` de Onboarding.

---

## MÉDIO

### M1. Primitivo de menu/popover repetido em 5 arquivos
**Evidência:** a mesma string de item de menu aparece em
Composer.tsx:99–100, AccountBadge.tsx:149–150, MicButton.tsx:185 e :217,
SessionMenu.tsx:25–26 (`flex w-full items-center gap-2 rounded px-2 py-1.5
text-left text-sm text-muted … hover:bg-white/[0.06] hover:text-fg`). A moldura
do popover (`…border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl
shadow-black/70`) aparece em Composer.tsx:105, BranchPicker.tsx:131,
AccountBadge.tsx:200, MicButton.tsx:168, SessionMenu.tsx:133 — com `rounded-lg`
em quatro e `rounded-xl`/`p-1.5` no ModelPicker.tsx:92, ou seja, já divergiu.

**Correção proposta:** criar `components/ui/` com
`Popover.tsx` → `({ anchor: 'top'|'bottom'; align: 'left'|'right'; width?: number; onClose; trigger; children })`
usando `usePopover` internamente (hoje chamado 7 vezes solto: StatusBar.tsx:62,
Composer.tsx:97, AccountBadge.tsx:28, MicButton.tsx:63, SessionMenu.tsx:52,
ModelPicker.tsx:20/78, BranchPicker.tsx:41), `MenuItem.tsx`
→ `({ icon, label, hint?, checked?, tone?: 'default'|'danger'|'accent', onClick })`
e `MenuLabel.tsx` para o rótulo `text-micro uppercase tracking-wider text-dim`
(AccountBadge.tsx:216, MicButton.tsx:170/197, Composer.tsx:115,
SchedulesPanel.tsx:288/324/366).

### M2. Segmentado de duas opções duplicado em 3 lugares
**Evidência:** Composer.tsx:536–550 (`steer`/`followUp`),
SchedulesPanel.tsx:433–447 (`steer`/`follow_up`) e QueuePopover.tsx:87 — mesma
moldura `flex gap-0.5 rounded-md bg-black/25 p-0.5` e mesmo item
`rounded px-1.5 py-0.5 text-micro … bg-elevated text-fg`.

**Correção proposta:** `components/ui/Segmented.tsx` →
`<Segmented<T> value={v} options={[{ value, label, title }]} onChange={fn} />`.

### M3. Botão de ícone da barra/cabeçalho repetido em 11 pontos
**Evidência:** o mesmo botão de ícone `no-drag … rounded-md p-1(.5) text-dim …
hover:bg-elevated hover:text-fg` aparece em SchedulesPanel.tsx:251 e :258,
TerminalPanel.tsx:180/187/194, StatusBar.tsx:242, DockPanel.tsx:87,
DocumentPanel.tsx:44 e MicButton.tsx:160 — 9 cópias. (Transcript.tsx:77 e
StalledTurnNotice.tsx:58 usam o mesmo hover, mas são botões de texto: ficam de
fora.) O `ToolButton` de StatusBar.tsx:149–179 já é esse primitivo, mas fica
privado ao arquivo e com caixa fixa de 28px.

**Correção proposta:** mover para `components/ui/IconButton.tsx` →
`({ icon, title, active?, badge?, disabled?, spinning?, size?: 'sm'|'md', onClick })`
e reescrever `ToolButton` como um wrapper (ou eliminá-lo). Trocar os 11 usos.

### M4. Input de renomear inline duplicado 3× dentro da própria Sidebar
**Evidência:** Sidebar.tsx:71–81 (renomear conversa), :252–262 (renomear pasta),
:580–589 (nome de pasta nova) — mesmo `autoFocus` + `onBlur` commit +
`Enter`/`Escape` + classe `border-primary/4x bg-black/40`. Onboarding.tsx:337
repete a mesma família de classe para outro fim.

**Correção proposta:** `components/ui/InlineEdit.tsx` →
`({ value, placeholder?, onCommit: (v: string) => void, onCancel: () => void, size?: 'sm'|'md' })`,
encapsulando autofoco, commit no blur e as duas teclas.

### M5. `SchedulesPanel` são dois painéis num arquivo
**Evidência:** SchedulesPanel.tsx:103–464. A parte de jobs (:321–363) e a de
heartbeat (:365–460) não compartilham nada além do `data.reload` e do
`withResidentWarning`; o estado é dobrado por prefixo (`schedule`/`prompt` :110–111
vs `hbSchedule`/`hbPrompt`/`hbDelivery` :116–118). O card de job (:331–362) e o de
heartbeat (:371–419) repetem a mesma estrutura (ícone + expressão mono +
`StatusBadge` + prompt em `line-clamp-3` + linha de metadados).

**Correção proposta:** `components/schedules/JobCard.tsx`
(`{ job, onCancel }`), `HeartbeatCard.tsx` (`{ heartbeat, onToggle, onClear }`),
`ScheduleForm.tsx` (`{ mode: 'job'|'heartbeat', busy, onSubmit }`) e
`lib/useSchedules.ts` para `data`/`create`/`remove`/`saveHeartbeat`/
`changeHeartbeat` (:124–224). Extrair também um
`components/ui/CardRow.tsx` para o cabeçalho comum dos dois cards.

### M6. `Message` é `memo`, mas recebe o dicionário inteiro de ferramentas
**Evidência:** Transcript.tsx:84–91 passa `tools={tools}` para cada `Message`;
`Message` é `memo` com comparação rasa (Message.tsx:52–58) e só usa
`tools[block.id]` (Message.tsx:183). O store substitui o objeto a cada evento de
ferramenta (`store/transcript.ts:139–140`), então **todas** as mensagens da
janela re-renderizam a cada chunk de tool. Marcado MÉDIO e não ALTO por respeito
ao princípio 3 do CONTRIBUTING ("medir antes de otimizar"): o efeito precisa ser
medido antes da troca.

**Correção proposta:** estreitar o prop em vez de espalhar `memo`. Ou
`Message` recebe `execs: readonly (ToolExec | undefined)[]` já resolvidos por
`useMemo` no `Transcript` por mensagem, ou o `ToolCard` passa a ler
`useAgent((s) => s.tools[id])` por conta própria (ToolCard.tsx já é folha) e o
prop `tools` desaparece de `Transcript`/`Message`.

### M7. Tipo de domínio mora dentro de um componente
**Evidência:** `SshConnection` é exportado de Composer.tsx:18–25 e importado por
`lib/useExecutionTarget.ts:2` e — via `SshForm` — por SshModal.tsx; `App.tsx:149`
depende do mesmo tipo pela assinatura do hook. Ou seja, um hook e o App importam
de um componente de UI. Além disso, `EnvStatus` está declarado duas vezes,
idêntico, em Onboarding.tsx:11–14 e AccountBadge.tsx:9–12, e `SpeechStatus`/
`SpeechModel` em MicButton.tsx:9–16 — todos são formas de retorno do IPC
(preload/index.ts:19, :34, :80 devolvem `invoke` sem tipo).

**Correção proposta:** mover `SshConnection`, `SshForm`, `EnvStatus`,
`SpeechStatus` e `SpeechModel` para `src/shared/protocol.ts` (são contrato de
IPC) e importar nos componentes. Detalhe da tipagem do preload fica com o escopo 2.

---

## BAIXO

### B1. `Welcome` guarda estado de modal próprio
**Evidência:** Welcome.tsx:13 (`const [usage, setUsage] = useState(false)`),
:50 e :63–72 — o modal do painel de uso é aberto e renderizado dentro do
`Welcome`, que é filho de `Transcript` (Transcript.tsx:70), não do `App`. O
CONTRIBUTING diz que "o estado do modal vive no App". Funciona hoje só porque o
`Modal` usa `createPortal` — e o comentário Modal.tsx:97–114 registra que esse
portal foi criado justamente para consertar o sintoma desse caso.
**Correção:** subir `usage` para o `App` (`const [usage, setUsage] = useState(false)`),
passar `onOpenUsage` por `Transcript` → `Welcome`, e renderizar
`<UsageModal open={usage} … />` ao lado dos outros em App.tsx:173–184. Alternativa
melhor: `useAgent` já tem `requestConfirm`/`requestTerminal`; um
`requestModal('usage')` seguiria o mesmo padrão sem props novos.

### B2. `CommandPalette` monta a própria moldura de overlay
**Evidência:** CommandPalette.tsx:76 (`fixed inset-0 z-modal … backdrop-blur-[2px]`),
que reimplementa a moldura do Modal.tsx:117. O estado está no `App`
(App.tsx:54, :173), então a regra principal é respeitada; o que falta é reuso da
moldura, do trap de Tab e do Esc.
**Correção:** aceitar `variant='palette'` no `Modal` (alinhamento `items-start
pt-[16vh]`, sem cabeçalho) ou extrair `components/ui/Overlay.tsx` usado pelos dois.

### B3. `Onboarding` é uma tela de 4 blocos num arquivo só
**Evidência:** Onboarding.tsx:46–411 — 10 estados (:48–59), 4 efeitos (:75–118) e
três blocos de JSX independentes: instalar (:226–281), autenticar (:284–400) e
pronto (:402–407). Não há duplicação real entre eles, então é organização, não
risco.
**Correção:** `components/onboarding/InstallStep.tsx`, `AuthStep.tsx` e
`lib/useEnvironmentSetup.ts` (`{ status, stage, error, check, install }`),
levando :61–131. Ganha-se também poder testar `check` sem a árvore.

### B4. Strings fora do i18n no `AccountBadge`
**Evidência:** AccountBadge.tsx:282 escolhe a frase por `lang === 'pt' ? … : 'es' ? … : …`
em vez de usar `t()`, ao contrário do resto do arquivo.
**Correção:** mover para `i18n` como `acct.credsNote` e usar `{t('acct.credsNote')}`.

---

## Nota de execução

As extrações A1–A3 e M1–M5 são mecânicas e não mudam comportamento, mas tocam os
arquivos mais visíveis do app: fazer em PRs separados por componente, com
`npm run typecheck` e `npm run build` em cada um, e validação visual do bloco
mexido (REDESIGN §"Validação visual"). M6 só depois de medir.
