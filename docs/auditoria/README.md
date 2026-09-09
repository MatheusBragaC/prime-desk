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

## Lacuna de processo

O projeto **nao tem ESLint**. Nenhuma das convencoes acima e verificavel automaticamente hoje.
Sugestao dos auditores: ESLint com `import/no-restricted-paths` (proibir `lib/` -> `components/`)
mais um `scripts/checkui.cjs` no molde do `scripts/checkrpc.cjs`, ligados ao `npm run check`.
