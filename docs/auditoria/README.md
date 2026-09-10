# Auditoria de front-end — consolidado

Quatro auditorias independentes sobre `src/renderer/src` (componentizacao, tipagem,
abstracao, padroes de UI). Nenhum arquivo de codigo foi alterado.
Relatorios completos: `componentizacao.md`, `tipagem.md`, `abstracao.md`, `padroes.md`.

## Veredito

A interface **esta componentizada** (38 componentes, 24 hooks, store com reducer puro,
`App.tsx` so compondo) e **segue boa parte dos padroes** (escala tipografica 238/240,
i18n com 423 chaves simetricas em pt/en/es, zero `@ts-ignore`, padrao de modal respeitado
no `App`). O que **nao** esta cumprido e a **tipagem da fronteira IPC** e a **direcao das
dependencias entre camadas**.

`npm run typecheck` passa limpo, mas isso hoje da falsa seguranca: o preload devolve
`Promise<any>`, entao erro de contrato nao aparece no typecheck.

## Contagem

| Escopo | ALTO | MEDIO | BAIXO |
|---|---|---|---|
| Tipagem | 16 | 40 | 63 |
| Abstracao | 7 | 19 | 21 |
| Componentizacao | 4 | 7 | 4 |
| Padroes de UI | 4 | 9 | 11 |
| **Total** | **31** | **75** | **99** |

## Achados confirmados por mais de uma auditoria (prioridade maxima)

1. **`preload/index.ts:111` sem tipo de retorno** -> `Promise<any>` em toda a `PrimeApi`,
   ~25 casts `as X` no renderer. Provado com `tsc`: campo inexistente compila.
2. **`lib/` importando de `components/`** (inversao de camada) — `useDock.ts:2`,
   `useAppShortcuts.ts:2`, `useExecutionTarget.ts:2-3`. Achado por tipagem, abstracao e padroes.
3. **Destino de execucao (`execution`) sem dono** — `Composer.tsx:180-188`,
   `useExecutionTarget.ts:45-67`, `agent.ts:743`. Sintoma visivel: chip fica velho se o `cwd` nao muda.
4. **`EnvStatus` duplicado** — `AccountBadge.tsx:9` e `Onboarding.tsx:11` vs `main/onboarding.ts:17`,
   com dois assinantes do mesmo canal lendo tipos diferentes.

## Defeitos de runtime (nao sao so arquitetura)

- **Vazamento de PTY**: `TerminalPanel.tsx:43-44` guarda abas em `useState`, `DockHost.tsx:34-35`
  desmonta o painel ao fechar o dock, `killTerminal` (:119) nunca roda.
- **`dangerouslySetInnerHTML` alimentado por `any`**: `FileViewer.tsx:52-60` -> `:218`.
- **Assinatura de evento fora do assinante unico e sem guarda de `bridgeId`**: `SchedulesPanel.tsx:137-147`.
- **`Modal.Button` ignora `className` externo**: `Modal.tsx:202-205` (`className` antes de `{...rest}`).
- **Byte NUL literal** em `ObservedPanel.tsx:49`.

## Ordem de correcao sugerida

1. `shared/protocol.ts` como fonte unica dos 6 tipos de contrato + `lib/types.ts` para quebrar
   a inversao de camada. Barato e destrava o resto.
2. Anotar retorno de cada metodo do preload (`Envelope<T>`) e tipar `on()` com mapa `IpcEvents`.
   Converte falha de runtime em erro de typecheck.
3. Fechar a union `AgentEvent` (`KnownAgentEvent` + `isAgentEvent<K>()`), removendo os `as unknown as`.
4. Corrigir os defeitos de runtime acima (abas do terminal no store; guarda no `SchedulesPanel`;
   merge de `className` no `Button`).
5. Dar dono ao `execution` no store e criar `lib/useEnvironment.ts`.
6. Fatiar `store/agent.ts` (1023 linhas) em 8 fatias com barrel; extrair `Composer` e `Sidebar`.
7. Tokens `line`/`hover`/`scrim` no `tailwind.config.js` (81 alphas crus) e migrar imports para `@/`+`@shared/`.

## Lacuna de processo — fechada pela catraca

O projeto **nao tinha ESLint**: nenhuma das convencoes acima era verificavel automaticamente.
Hoje `npm run check` roda `lint` + `typecheck` + `check:rpc` + `check:ui`.

### ESLint (`eslint.config.mjs`)

Preset deliberadamente pequeno. Cada regra `error` corresponde a um defeito que ja aconteceu aqui:

| Regra | Escopo | Sev. | Defeito de origem |
|---|---|---|---|
| `import/no-restricted-paths` + `no-restricted-imports` | `renderer/src/lib/**` | error | achado 2 (inversao `lib/` -> `components/`) |
| `no-restricted-imports` (grupo `main`) | `renderer/**` | error | renderer arrastando codigo de Node para o bundle |
| `react-hooks/rules-of-hooks` | `renderer/**` | error | hook condicional |
| `@typescript-eslint/no-explicit-any` | `preload/**`, `shared/**` | error | achado 1 (`Promise<any>` -> ~25 casts) |
| `@typescript-eslint/consistent-type-assertions` | `preload/**`, `shared/**` | error | cast de objeto literal na fronteira |
| `@typescript-eslint/ban-ts-comment` | `src/**` | error | repo tem zero `@ts-ignore`; a regra preserva isso |
| `no-control-regex`, `no-irregular-whitespace` | `src/**` | error | achado D (bytes de controle no fonte) |

Dívida deixada como `warn` para nao exigir reescrita em massa — **7 avisos**, congelados pelo
`--max-warnings 7` do script `lint`:

- `react-hooks/exhaustive-deps` (6): 5 sao a dependencia `t` do i18n, que muda a cada render de
  idioma; 1 e lista de deps nao literal em `useStickyScroll.ts:93`. Corrigir exige mexer no ciclo
  de vida dos hooks — fora do escopo da catraca.
- `@typescript-eslint/no-explicit-any` (1): `src/main/index.ts:83`, a assinatura generica do
  dispatcher do `ipcMain.handle`. No `preload`/`shared` a mesma regra e `error`.

Quem pagar parte da divida baixa o numero no `--max-warnings` junto, no mesmo commit.

### `scripts/checkui.cjs` — baseline versionado

Pega o que o ESLint nao ve. Uma medida e tolerancia zero; as outras quatro sao **catraca**: o
numero atual esta congelado em `scripts/ui-baseline.json` e o script falha **apenas se piorar**.

| Medida | Modo | Hoje | Como pagar |
|---|---|---|---|
| `nul` — byte NUL literal (todo `src/`) | zero | 0 | trocar por `\u0000` no literal |
| `alpha` — alpha cru de cor (`white/[0.06]`) | ratchet | 5 | tokens de papel (`hover`, `well`, `scrim`, …) no `tailwind.config.js` |
| `offscale` — `text-[Npx]` fora da escala do REDESIGN 3.1 | ratchet | 2 | `text-xs/sm/base/lg/xl/display` |
| `i18nInline` — i18n por ternario inline no JSX | ratchet | 2 | chave em `src/renderer/src/i18n` + `t()` |
| `hardcoded` — string de UI hardcoded em componente | ratchet | 12 | passar pelo `t()` |

O `alpha` contava 95 e nao os 81 do relatorio de padroes: o relatorio contou ocorrencias distintas,
o script conta todas as ocorrencias. Hoje sao 5 — restam so as do `AccountBadge.tsx`. O `offscale` 2 e o outro lado do "escala tipografica 238/240".

**Atualizar o baseline quando a divida for paga:**

```bash
npm run check:ui -- --update   # re-mede e reescreve scripts/ui-baseline.json
git diff scripts/ui-baseline.json
```

O baseline **so pode descer**. Se o diff subir algum numero, a mudanca introduziu divida nova e o
`--update` esta sendo usado para esconder regressao — reverta. O script avisa sozinho quando uma
medida cai abaixo do limite, para o baseline nao ficar folgado.
