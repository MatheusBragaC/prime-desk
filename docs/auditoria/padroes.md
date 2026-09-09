# Auditoria — Escopo 4: aderência aos padrões de UI e convenções

Base: `src/renderer/src` (40 arquivos em `components/`, 31 em `lib/`, 2 em `store/`,
`App.tsx`, `i18n/index.ts`). Referências: `CONTRIBUTING.md`, `docs/REDESIGN.md`
§1 (itens 2, 11, 12), §3.1, §3.9, `tailwind.config.js`.
Nenhum arquivo de código foi alterado.

## Resumo por severidade

| Severidade | Achados |
|---|---|
| ALTO | 4 |
| MÉDIO | 9 |
| BAIXO | 11 |
| Correto (sem ação) | 3 |

---

## 1. Design tokens

### 1.1 [ALTO] 81 usos de `white/…` e `black/…` crus onde já existe token

O tema define `--p-line` e o Tailwind expõe `elevated`, `surface`, `panel`.
Mesmo assim o hover de superfície é escrito com alpha literal em **35 lugares,
com 8 valores diferentes** para o mesmo papel visual:

`bg-white/[0.06]` ×19, `[0.04]` ×4, `[0.05]` ×3, `[0.02]` ×3, `[0.03]` ×2,
`[0.07]` ×2, `[0.045]` ×1, `[0.08]` ×1.

Exemplos: `components/AccountBadge.tsx:150` (`0.06`), `:162` (`0.03`), `:173`
(`0.07`) — três tons de hover no mesmo menu; `components/ModelPicker.tsx:26`
(`0.06`) vs `:49` (`0.05`) vs `:85` (`0.06`) vs `:106` (`0.05`);
`components/FilesPanel.tsx:63` (`0.045`); `components/StatusBar.tsx:91` (`0.08`);
`components/Modal.tsx:141` (`0.07`) vs `Modal.tsx:201` (`0.06`) — o próprio
componente de referência do padrão de modal usa dois valores.

Bordas seguem o mesmo padrão: `border-white/[0.1]` ×13, `[0.12]` ×3, `/20` ×3,
`/15` ×1, `/10` ×1 (ex.: `components/CommandPalette.tsx:80`,
`components/Modal.tsx:200`, `components/Onboarding.tsx:337`), concorrendo com
`border-[var(--p-line)]` usado 73 vezes.

Fundos de véu/scrim: `bg-black/25` ×8, `/40` ×7, `/20` ×3, `/35` ×2, `/50`,
`/55`, `/60`, `/30` — quatro véus de modal distintos
(`Modal.tsx:126`, `CommandPalette.tsx:76`, `App.tsx:90`).

**Correção.** Em `tailwind.config.js`, dentro de `theme.extend`:

```js
colors: {
  line: 'rgb(var(--p-line-rgb) / <alpha-value>)',
  hover: 'rgb(var(--p-hover-rgb) / <alpha-value>)',   // 1 tom de hover
  scrim: 'rgb(var(--p-scrim-rgb) / <alpha-value>)'    // 1 véu
},
borderColor: { DEFAULT: 'rgb(var(--p-line-rgb) / <alpha-value>)' }
```

Adicionar `--p-line-rgb`, `--p-hover-rgb` e `--p-scrim-rgb` em
`styles/theme.css` (§3.1 já define `--p-line`; falta a forma `-rgb` que o
`<alpha-value>` exige). Depois: `bg-white/[0.0X]` → `bg-hover`,
`border-white/[0.1X]` → `border-line`, `bg-black/4X` → `bg-scrim`,
`border-[var(--p-line)]` → `border-line`.

### 1.2 [MÉDIO] 36 usos de `*-[var(--p-…)]` que duplicam token já nomeado

`bg-[var(--p-panel)]` ×16, `bg-[var(--p-surface)]` ×12, `bg-[var(--p-bg)]` ×6,
`from-[var(--p-bg)]` ×1, `border-[var(--p-elevated)]` ×1 — todos têm
equivalente direto no `tailwind.config.js` (`bg-panel`, `bg-surface`, `bg-bg`,
`border-elevated`). Exemplos: `App.tsx:87`, `components/CommandPalette.tsx:80`,
`components/Onboarding.tsx` (13 ocorrências de valor arbitrário no arquivo),
`components/ToolCard.tsx` (10).

Resultado: duas sintaxes para o mesmo token, e nenhuma busca encontra as duas.

**Correção.** Substituição mecânica para a classe nomeada. Só mantêm a forma
`var()` os tokens sem entrada no config: `--p-user-bg`, `--p-selected`,
`--p-diff-added`, `--p-diff-removed`, `--p-titlebar` — e o melhor é promovê-los
a token (`colors.userBg`, `colors.selected`, `colors.diffAdded`,
`colors.diffRemoved`, `spacing.titlebar`).

### 1.3 [MÉDIO] Ícones fora da escala de dois tamanhos (52 de 214)

`docs/REDESIGN.md` §3.9: "dois tamanhos, 16 px (padrão) e 14 px (linhas densas)".
Hoje há **10 tamanhos** em 214 usos de `size={…}`:

`14` ×112 ✔, `16` ×50 ✔, `13` ×21, `12` ×12, `15` ×10, `11` ×3, `18`, `19`,
`10`, `9`, `46`, `34` (×1 cada).

Concentração: `MicButton.tsx` 9 desvios (`:141,143,145` = 15; `:149` = 12;
`:162,187,190,207,219` = 13), `SchedulesPanel.tsx` 7 (`:300,402,403,415` = 12;
`:333,344,373` = 13), `QueuePopover.tsx` 6 (`:59` = 11; `:149,155,162` = 13;
`:181,186` = 12), `TerminalPanel.tsx` 6 (`:160,161` = 13; `:172` = 11;
`:183,190,196` = 15), `AgentTree.tsx` 4, `BranchPicker.tsx` 3,
`StalledTurnNotice.tsx` 3 (`:50` = 10, `:61` = 9 — abaixo do mínimo legível).

Casos legítimos e que devem ficar: `Onboarding.tsx:179` (`size={46}`) e
`Welcome.tsx:37` (`size={34}`) são a borboleta de marca, não ícone de UI.

**Correção.** Criar `src/renderer/src/lib/icon.ts`:

```ts
/** Escala de ícone do §3.9: `md` padrão, `sm` em linhas densas. */
export const ICON = { sm: 14, md: 16 } as const
export const ICON_STROKE = 1.75
```

E normalizar: 15/18/19 → 16; 13/12/11/10/9 → 14 (ou 16 quando o ícone é alvo de
clique isolado, para respeitar o alvo mínimo de toque).

### 1.4 [BAIXO] 2 tamanhos de fonte arbitrários e 3 raios arbitrários

- `components/StatusBar.tsx:173` — `text-[9px]` no contador do badge.
- `components/UsagePanel.tsx:55` — `text-[8px]` no rótulo do heatmap.
- `components/FilesPanel.tsx:201` — `rounded-[9px]` (o `rounded-[9px]` citado em
  §1 item 11 sobreviveu aqui).
- `components/UsagePanel.tsx:70` — `rounded-[2px]` na célula do heatmap.
- `components/Message.tsx:80` — `rounded-br-[6px]`: **é intencional**, §2 lista o
  canto cortado da bolha do usuário como acerto. Documentar com comentário e
  deixar.

Correções: `text-[9px]`/`text-[8px]` → `text-micro` (10,5 px) ou, se 10,5 px
quebrar o layout do badge, criar um degrau `nano` no `fontSize` do config em vez
de valor solto; `rounded-[9px]` → `rounded-card` ou `rounded-lg`;
`rounded-[2px]` → `rounded-sm`.

### 1.5 [MÉDIO] Raios semânticos praticamente não usados (16 de 130)

`rounded-card|field|composer` aparecem 16 vezes; os genéricos do Tailwind, 111
(`rounded-lg` ×39, `rounded-md` ×31, `rounded-full` ×18, `rounded-xl` ×13,
`rounded-sm` ×7, `rounded-2xl` ×2). §1 item 11 pedia exatamente o fim dessa
mistura: `rounded-2xl` (`CommandPalette.tsx:80`) e `rounded-xl` coexistem com
`rounded-field` para o mesmo papel (campo/menu).

**Correção.** Mapear por papel, não por pixel: campo/menu/popover →
`rounded-field`; card de conteúdo → `rounded-card`; composer → `rounded-composer`;
`rounded-full` fica (pílula/avatar). Depois, remover `borderRadius` genérico não
usado ou documentar no `tailwind.config.js` quando cada um vale.

### 1.6 [BAIXO] 8 hex inline

- `components/FileViewer.tsx:210` — `bg-[#08080a]` e `text-[#c9c9d1]`; `:215` — `bg-[#08080a]`.
- `components/AgentTree.tsx:139` — `bg-[#08080a]`.
- `components/Notice.tsx:26` — `bg-[#20121a]` (fundo de erro fora da paleta).
- `components/TerminalView.tsx:47-49` — `#08080a`, `#c9c9d1`, `#7a7aff` no tema
  do xterm. Aqui hex é inevitável (xterm recebe cor, não classe), mas os valores
  deveriam vir de token.

**Correção.** Criar `--p-code-bg`, `--p-code-fg` e `--p-term-cursor` em
`theme.css`; nas classes usar `bg-[var(--p-code-bg)]`; em `TerminalView.tsx`
ler via `getComputedStyle(document.documentElement).getPropertyValue('--p-code-bg')`
num helper `lib/themeColor.ts` — assim o tema claro futuro (§4 fase 8) não deixa
o terminal preto. `Notice.tsx:26` → `bg-err/[0.08]`.

### 1.7 [BAIXO] 103 valores arbitrários de espaçamento/tamanho

`mt-[2px]` ×14, `mt-[1px]` ×7, `mt-[3px]` ×5, `py-[1px]` ×4, `gap-[3px]` ×4,
`h-[5px]`/`w-[5px]` ×3 etc. Os `mt-[1px|2px|3px]` são correção óptica de
alinhamento de ícone (ex.: `PanelState.tsx:15`, `Notice.tsx:33`) — sintoma de
ícone e texto sem baseline comum, resolvido de uma vez com
`inline-flex items-center` no wrapper do ícone em vez de 26 nudges.
Os 9 usos com `var()` (`h-[var(--p-titlebar)]`, `pt-[var(--turn-gap)]`) estão
**corretos**: referenciam token. Correção: promover `--p-titlebar` e
`--turn-gap` a `spacing` no config (`h-titlebar`, `pt-turn`).

### 1.8 [CORRETO] Escala tipográfica

238 de 240 usos de `text-*` caem na escala de sete degraus (`text-sm` ×90,
`text-xs` ×75, `text-micro` ×62, `text-base` ×6, `lg`, `xl`, `display`). Os 21
tamanhos citados em §1 item 2 foram de fato eliminados. `strokeWidth={1.75}`
está em 199 de 205 ícones lucide; os 6 sem ele são `Butterfly`/`StatusIcon`, que
não têm a prop. Nada a fazer.

---

## 2. i18n

### 2.1 [ALTO] Tradução por ternário inline em vez de chave

`components/AccountBadge.tsx:282`:

```tsx
{lang === 'pt' ? 'Credenciais ficam no prime-agent.' : lang === 'es' ? 'Las credenciales viven en prime-agent.' : 'Credentials live in prime-agent.'}
```

Três traduções embutidas no JSX, fora do dicionário. Quebra o padrão em que
`i18n/index.ts` é a fonte única e torna o texto invisível para qualquer
verificação de cobertura.

**Correção.** Adicionar `"acct.credsNote"` em `pt`/`en`/`es` e trocar por
`{t('acct.credsNote')}`.

### 2.2 [MÉDIO] Strings de usuário hardcoded em português (7 pontos)

| Local | String |
|---|---|
| `components/SessionMenu.tsx:90` | `notify('error', 'Não foi possível duplicar esta conversa.')` |
| `components/SessionMenu.tsx:92` | `notify('info', 'Conversa duplicada.')` |
| `lib/useExecutionTarget.ts:59` | `r.error ?? 'Não foi possível iniciar nesse destino.'` |
| `components/Onboarding.tsx:150` | `r?.error ?? 'Falha ao abrir terminal.'` |
| `components/TerminalView.tsx:94` | `created?.error ?? 'Falha ao abrir o terminal.'` |
| `components/ResizeHandle.tsx:20` | `title="Arraste para redimensionar · duplo clique para restaurar"` |
| `components/FileViewer.tsx:115` | `title="Alterado"` |

Ironia útil: `exec.startFailed` e `mic.noEngine` **existem** no dicionário e
não são usados (ver 2.4), enquanto o fallback literal está no código.

**Correção.** `session.duplicateFailed`, `session.duplicated`,
`handle.resizeHint`, `file.dirty` como chaves novas; nos três fallbacks de erro
usar `exec.startFailed`, que já existe, e criar `terminal.openFailed`.
`ResizeHandle.tsx` e `TerminalView.tsx` hoje nem importam `../i18n` — precisam
de `useT()`.

### 2.3 [BAIXO] Texto de marca e placeholders literais — aceitáveis

- `components/Sidebar.tsx:470` — `Prime Desk`: nome do produto, não traduz. **Correto.**
- `components/SlashMenu.tsx:75-76` — `<kbd>Tab</kbd> / <kbd>Enter</kbd>`,
  `<kbd>Esc</kbd>`: nomes de tecla, com a parte traduzível já em
  `t('slash.insert')` / `t('slash.dismiss')`. **Correto.**
- `components/SshModal.tsx:95,105,115` — `placeholder="22"`, `"~/.ssh/id_rsa"`,
  `"/opt/projeto"`. Os dois primeiros são sintaxe; `"/opt/projeto"` tem palavra
  em português — trocar por `/srv/app` ou virar chave.
- `components/Butterfly.tsx:19` — `aria-label="Prime"`: marca. **Correto.**

### 2.4 [BAIXO] 23 chaves mortas × 3 idiomas = 69 entradas

`acct.signedIn`, `chat.working`, `chips.branch`, `chips.files`,
`chips.filesTitle`, `exec.startFailed`, `mic.noEngine`, `onb.copy`,
`session.alreadyOpen`, `sidebar.agentTree`, `sidebar.conversations`,
`sidebar.pickCwd`, `sidebar.pickCwdEmpty`, `usage.cache`, `usage.cost`,
`usage.favoriteModel`, `usage.input`, `usage.longest`, `usage.output`,
`usage.peak`, `usage.streak`, `usage.subtitle`, `usage.tokens`.

Herança das fases 5–6 do redesign (`sidebar.conversations` e `usage.*` foram
removidos da tela por §3.5 e §3.7). **Correção.** Apagar as 69 linhas, ou
reaproveitar as duas úteis conforme 2.2. Chaves montadas dinamicamente
(`t(\`sched.status.${status}\`)` em `SchedulesPanel.tsx:58`,
`t(\`thinking.${l}\`)` em `ModelPicker.tsx:8`) **não** são mortas e foram
excluídas da contagem.

### 2.5 [CORRETO] Dicionário simétrico

`pt`, `en` e `es` têm exatamente 423 chaves cada, sem diferença de conjunto.
386 chaves são referenciadas no código. Nenhuma chave usada falta no dicionário.

---

## 3. Convenções

### 3.1 [ALTO] Alias `@/` configurado e com 0 uso; 221 imports relativos

`tsconfig.json:36-38` define `"@/*": ["src/renderer/src/*"]` e
`electron.vite.config.ts:45` define o alias equivalente no Vite. Uso real: **zero**.
Todos os 221 imports são relativos, incluindo:

- `../../../shared/protocol` — **18 ocorrências** (`components/AgentTree.tsx:6`,
  `Composer.tsx:15`, `FilesPanel.tsx:6`, `Message.tsx:2`, `ModelPicker.tsx:4`,
  `QueuePopover.tsx:7`, …). Três níveis de `..` para o contrato IPC.
- `../i18n` ×36, `../store/agent` ×33, `../lib/format` ×11.

**Correção.** Adicionar `"@shared/*": ["src/shared/*"]` no `tsconfig.json` e o
par em `electron.vite.config.ts` (`'@shared': resolve('src/shared')`), então
migrar: `../../../shared/protocol` → `@shared/protocol`, `../i18n` → `@/i18n`,
`../store/agent` → `@/store/agent`. Sem isso, mover qualquer arquivo de
`components/` para uma subpasta quebra 221 caminhos — o que hoje é o principal
custo de reorganizar a pasta (3.3).

### 3.2 [ALTO] `lib/` importa de `components/`: dependência invertida em 3 pontos

- `lib/useAppShortcuts.ts:2` — `import type { Dock } from '../components/StatusBar'`
- `lib/useDock.ts:2` — `import type { Dock } from '../components/StatusBar'`
- `lib/useExecutionTarget.ts:2-3` — `import type { SshConnection } from '../components/Composer'`
  e `SshForm` de `'../components/SshModal'`

`Dock` (`components/StatusBar.tsx:146`) é o tipo de identidade do painel lateral —
consumido por `DockHost.tsx:7`, `useDock.ts`, `useAppShortcuts.ts` e `App.tsx`.
Ele mora dentro do componente da barra de status por acidente histórico. O mesmo
para `SshConnection` (`Composer.tsx`) e `SshForm` (`SshModal.tsx`), que são
modelo de dados, não props de componente.

**Correção.** Criar `src/renderer/src/lib/dock.ts`:

```ts
export type Dock = 'files' | 'agents' | 'diff' | 'terminal' | 'schedules' | 'document' | null
export type DockKind = Exclude<Dock, null>
```

e `src/renderer/src/lib/ssh.ts` com `SshConnection` e `SshForm` (ou movê-los para
`src/shared/protocol.ts` se atravessam o IPC — verificar antes). Depois,
`components/` passa a importar de `lib/`, nunca o contrário. A regra vira
verificável: nenhum arquivo em `lib/`, `store/` ou `i18n/` pode conter
`from '../components/`.

### 3.3 [MÉDIO] `components/` plana com 40 arquivos e clusters evidentes

Não é só volume: os arquivos já formam grupos fechados que a pasta única
esconde. Agrupamento observado pelos imports:

| Cluster | Arquivos |
|---|---|
| Dock (casca + painéis) | `DockHost`, `DockPanel`, `PanelState`, `FilesPanel`, `DiffPanel`, `TerminalPanel`, `TerminalView`, `SchedulesPanel`, `AgentTree`, `DocumentPanel`, `ObservedPanel`, `FileViewer` |
| Composer | `Composer` (725 linhas), `MicButton`, `SlashMenu`, `ModelPicker`, `BranchPicker`, `QueuePopover` |
| Transcrição | `Transcript`, `Message`, `Markdown`, `ToolCard`, `ThinkingBlock`, `PendingBubble`, `DocumentCard`, `StalledTurnNotice` |
| Cromo | `Sidebar` (654), `StatusBar` (337), `SessionMenu`, `AccountBadge`, `ResizeHandle`, `Notice` |
| Diálogos / telas | `Modal`, `ConfirmDialog`, `SshModal`, `CommandPalette`, `Onboarding` (411), `Welcome`, `UsagePanel` |
| Marca | `Butterfly` |

`DockHost.tsx` é a evidência mais limpa: ele importa 6 dos 12 arquivos do
cluster Dock e nada fora dele. `lib/` tem o problema espelhado — 16 hooks (`use*.ts`)
misturados com 15 utilitários puros (`format.ts`, `grouping.ts`, `schedule.ts`, …).

**Correção.** Organizar por feature, com `components/ui/` para o que é
genuinamente compartilhado:

```
components/ui/       Modal, Button/Field/inputClass, Notice, PanelState, ResizeHandle, Butterfly
features/dock/       DockHost, DockPanel + os painéis
features/composer/   Composer + pickers + MicButton + SlashMenu
features/transcript/ Transcript, Message, Markdown, ToolCard, ThinkingBlock, …
features/chrome/     Sidebar, StatusBar, SessionMenu, AccountBadge
lib/hooks/           os 16 use*.ts
lib/                 utilitários puros
```

Pré-requisito: fazer 3.1 primeiro (alias), senão a movimentação reescreve
centenas de caminhos relativos. Custo baixo por pasta, então pode ser incremental
— `features/dock/` primeiro, que é o cluster mais isolado.

### 3.4 [MÉDIO] Byte NUL literal em `ObservedPanel.tsx:49`

```ts
const key = ids.join('\x00')   // NUL escrito como byte, não como escape
```

O arquivo contém o byte `0x00` no offset 1943, então `file` o classifica como
`data` e `grep` responde "binary file matches". Efeito prático: o arquivo sai de
qualquer varredura de texto (foi o único invisível a esta auditoria até
inspeção byte a byte) e diffs ficam ilegíveis.

**Correção.** Trocar o byte por escape: `ids.join('\0')` — ou melhor,
`ids.join('|')`, já que a chave só serve como memo de `useEffect` e nenhum id de
sessão contém `|`. Vale um teste de guarda no `scripts/test/` recusando bytes de
controle em `src/**`.

### 3.5 [BAIXO] Nome de arquivo divergente do export

- `components/PanelState.tsx` exporta `PanelError`, `PanelEmpty`, `PanelLoading`
  — nenhum `PanelState`. O conteúdo é bom e bem comentado (`:4-10`); só o nome
  engana. Renomear para `PanelStates.tsx` (plural) ou `panelStates.tsx`.
- `components/ModelPicker.tsx` também exporta `ThinkingPicker` (`:8` usa
  `thinkingLabel`). Justificável (compartilham `THINKING_COLOR`), mas ao mover
  para `features/composer/` vale separar.

### 3.6 [CORRETO] Convenção de export e de nome

Nenhum `export default` em 43 `.tsx`; todos usam export nomeado, arquivo em
PascalCase com export homônimo (exceções em 3.5). `lib/` em camelCase, hooks com
prefixo `use`. Consistência total — nada a fazer.

### 3.7 [BAIXO] Sem lint: nenhuma das regras acima é verificável hoje

`package.json` não tem ESLint nem script `lint`; `npm run check` roda apenas
`typecheck` + `check:rpc`. Todos os achados deste relatório são invisíveis ao CI
(`.github/workflows/release.yml` só builda).

**Correção.** Duas opções, da mais barata à mais completa:
1. `scripts/checkui.cjs` no molde do `scripts/checkrpc.cjs` já existente: falha
   se aparecer `text-[…px]`, `bg-white/[…]`, `size={` fora de `{14,16}`,
   `from '../components/` dentro de `lib/`, ou byte de controle em `src/**`.
   Entra em `npm run check`.
2. ESLint + `eslint-plugin-jsx-a11y` + `eslint-plugin-tailwindcss` +
   `no-restricted-imports` para os caminhos relativos profundos.

A opção 1 cobre o que este relatório mediu, sem adicionar 5 devDependencies.

---

## 4. Acessibilidade e semântica

### 4.1 [MÉDIO] Botão dentro de botão em `TerminalPanel.tsx:163-173`

A aba do terminal é um `<button>` (`:148`) e o fechar é um
`<span role="button" tabIndex={-1}>` **dentro** dele (`:163`). Dois problemas:
aninhamento interativo é HTML inválido (o leitor de tela anuncia um único
controle ambíguo) e `tabIndex={-1}` deixa o fechar inacessível pelo teclado.
Não há `aria-label` no fechar.

**Correção.** Tirar o fechar de dentro da aba: um wrapper
`<div className="flex items-center">` com dois irmãos — `<button>` da aba e
`<button aria-label={t('terminal.closeTab')} onClick={…}>` do fechar. O
`e.stopPropagation()` continua necessário só se ainda houver handler no pai.

### 4.2 [MÉDIO] 6 botões só de ícone sem nome acessível

| Local | Ícone | Papel |
|---|---|---|
| `components/DockPanel.tsx:85-90` | `X` | fechar — **casca compartilhada por todos os painéis do dock** |
| `components/FileViewer.tsx:163-166` | `X` | fechar visualizador |
| `components/ObservedPanel.tsx:150-153` | `X` | parar observação |
| `components/FilesPanel.tsx:210` | `X` | limpar filtro |
| `components/Notice.tsx:36` | `X` | dispensar aviso |
| `components/TerminalPanel.tsx:192-197` | `X` | fechar painel |

`DockPanel.tsx:85` é o mais grave por multiplicação: é o fechar de 6 painéis.
Contraste: `Modal.tsx:142` faz certo, com `aria-label={t('common.close')}`.

**Correção.** `aria-label={t('common.close')}` (chave já existe) nos cinco de
fechar; `aria-label={t('files.clearFilter')}` (chave nova) no de filtro. Padrão a
registrar no `CONTRIBUTING.md`: botão sem texto visível exige `aria-label`.

### 4.3 [BAIXO] 7 botões de ícone com `title` mas sem `aria-label`

`Composer.tsx` ×2, `Sidebar.tsx` ×2, `MicButton.tsx` ×1, `StatusBar.tsx` ×1,
`TerminalPanel.tsx:178,185`. `title` serve de nome acessível de fallback, então
funciona — mas depende da ordem de precedência do leitor de tela e o tooltip
nativo é lento. Correção: manter `title` para o mouse e adicionar `aria-label`
com o mesmo texto.

### 4.4 [BAIXO] `div` interativa sem papel nem teclado (4 casos)

- `App.tsx:89-92` — véu que fecha a sidebar em janela estreita. Como o fechar
  também existe no botão da sidebar, o correto aqui é o inverso: marcar como
  decoração (`aria-hidden="true"`), não adicionar `role="button"`.
- `components/ResizeHandle.tsx:17-25` — `onMouseDown` + `onDoubleClick` sem
  `role`, `tabIndex` nem teclado. Correção: `role="separator"`,
  `aria-orientation="vertical"`, `tabIndex={0}` e `onKeyDown` com
  ArrowLeft/ArrowRight (passo de 16 px) e `Home` para restaurar — o mesmo que o
  duplo clique já faz.
- `components/CommandPalette.tsx:75-83` — véu com `onMouseDown={onClose}` e
  caixa com `onKeyDown`. Falta `role="dialog"` e `aria-modal="true"`, que
  `Modal.tsx:126-132` já tem. Ver 4.5.

### 4.5 [MÉDIO] `CommandPalette` reimplementa o diálogo em vez de usar `Modal`

`CONTRIBUTING.md` § "Padrão de modal": todo diálogo usa `components/Modal.tsx`.
`components/CommandPalette.tsx:74-83` monta véu, caixa, `z-modal`, `animate-fade-up`
e sombra à mão, e por isso perde `role="dialog"`, `aria-modal`, o `Escape` e o
fechar do `Modal`. `Modal.tsx` é o único arquivo do renderer com ARIA de
diálogo. (Achado de fronteira com o escopo de componentização; registrado aqui
pelo lado da semântica.)

**Correção.** Ou usar `Modal` com uma variante `chrome="bare"` (sem cabeçalho e
sem padding), ou extrair de `Modal.tsx` um `useDialogA11y()` que devolva
`{ role, 'aria-modal', onKeyDown }` para quem precise da casca própria.

### 4.6 [BAIXO] Listas de menu sem semântica de lista

Sete popovers (`SessionMenu`, `ModelPicker`, `AccountBadge`, `SlashMenu`,
`QueuePopover`, `BranchPicker`, `CommandPalette`) renderizam `div` + `button`
sequenciais, sem `role="menu"`/`menuitem` nem `role="listbox"`/`option`.
`SlashMenu` e `CommandPalette` já têm navegação por setas, mas sem
`aria-activedescendant` o leitor de tela não anuncia o item em foco. A lista de
sessões na `Sidebar` também é `div` (as linhas são `<button>` de verdade —
`Sidebar.tsx:243` e `SessionRow` —, o que já evita o pior).

Uso correto e a manter: `Onboarding.tsx:332-350` (`<ol>`/`<li>`),
`App.tsx:110` (`<main>`), `Sidebar.tsx:453` e `DockPanel.tsx:59` (`<aside>`),
`MicButton.tsx:34` (`aria-hidden` no medidor de volume — decoração corretamente
escondida), `Butterfly.tsx:18-19` (`role="img"` + `aria-label`).

**Correção.** Ao consolidar os popovers (`usePopover` já é compartilhado por 8
arquivos), adicionar `role="menu"` no contêiner e `role="menuitem"` nos itens
num único componente `Menu`/`MenuItem` em `components/ui/`. Ganho por escrita
única, em vez de sete correções.

### 4.7 [BAIXO] Link de markdown sem `rel`

`components/Markdown.tsx:67` — `a: (props) => <a {...props} onClick={openExternal} />`.
O clique é interceptado e aberto no navegador externo, então o risco é pequeno,
mas se `href` sobrevive no DOM vale `rel="noreferrer noopener"` explícito.

---

## Ordem sugerida

1. **3.1** (alias `@shared`/`@/`) — destrava 3.3 e barateia todo o resto.
2. **3.2** (`lib/dock.ts`, `lib/ssh.ts`) — corrige a direção das dependências.
3. **4.1, 4.2** (`aria-label` + botão aninhado) — mudança pequena, ganho direto.
4. **1.1, 1.2** (tokens `line`/`hover`/`scrim`, fim do `var()` duplicado) —
   substituição mecânica, verificável por grep.
5. **1.3, 1.5** (escala de ícone e raio semântico).
6. **3.7** (`scripts/checkui.cjs`) — congela o resultado antes que regrida.
7. **2.1, 2.2, 2.4** (i18n) e **3.4** (byte NUL) — independentes, a qualquer momento.
8. **3.3** (organização por feature) — último, depois do alias.
