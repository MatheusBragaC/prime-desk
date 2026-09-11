# Contribuindo

## Ambiente

```bash
npm install
npm run fix-sandbox   # Linux, uma vez
npm run dev
```

## Antes de abrir PR

```bash
npm run check   # lint + typecheck + check:rpc + check:ui
npm run test
npm run build
```

`npm run check` é a catraca contra regressão. Cada verificação existe por causa de
um defeito real deste repositório; o mapa de regras, a dívida congelada e como
atualizar o baseline estão em `docs/auditoria/README.md` ("Lacuna de processo").

- `npm run lint` — ESLint. Direção das camadas (`lib/` não importa de
  `components/`, renderer não importa de `src/main`), `rules-of-hooks`, `any`
  proibido na fronteira IPC (`preload`/`shared`), nenhum `@ts-ignore` novo.
  Teto de avisos congelado: aviso novo derruba o build.
- `npm run check:rpc` — todo comando RPC chamado no renderer está na allowlist do main.
- `npm run check:ui` — byte NUL no fonte (tolerância zero) e a dívida de UI
  (alphas crus, escala tipográfica, i18n hardcoded) contra
  `scripts/ui-baseline.json`. Falha só se a dívida aumentar.

## Ícones

Entram por `@/icons`, nunca direto do `lucide-react` — há regra de eslint. O
módulo aplica traço e `aria-hidden`, e nomeia os papéis onde o mesmo desenho
servia a dois: `IconClose` fecha, `IconFailed` falha; `IconDone` é estado
concluído, `IconConfirm` é confirmação passageira; `IconAgents` é a árvore,
`IconBranch` é git; `IconTerminalPanel` é o lugar, `IconCommand` é o comando
executado.

Escolher pelo papel, não pelo desenho. Se o papel não existe ainda, crie-o no
módulo em vez de importar o glifo cru.

## Princípios do projeto

1. **A GUI é um cliente fino.** Nada de reimplementar contexto, compactação,
   skills ou orquestração — isso é do `prime-agent`.
2. **Não inventar recurso.** Se o `prime-agent` não faz, o botão não existe.
   Um controle que não tem contrapartida real é pior que a ausência dele.
3. **Medir antes de otimizar.** Ver `docs/MAPEAMENTO.md` §18: o "travamento" do
   streaming era rajada do modelo, não jank de render.
4. **Escopo de arquivo é escopo de workspace.** Nada de leitura ou escrita fora
   da raiz.
5. **Comentário explica o porquê**, não o quê.

## Padrão de import

Alias para tudo que atravessa diretório; relativo só para irmão da mesma pasta.

- `@/…` → `src/renderer/src/…` (ex.: `@/store/agent`, `@/lib/format`)
- `@shared/…` → `src/shared/…` (ex.: `@shared/protocol`)
- `./Modal`, `./rpc` — irmão continua relativo: alias em irmão esconde a
  proximidade e não elimina nenhum `../`.

Os aliases moram em três resolvedores e precisam andar juntos: `tsconfig.json`
(`paths`, usado pelo `typecheck`), `electron.vite.config.ts` (`renderer.resolve.alias`,
usado pelo `build`) e `scripts/test/run.mjs` (`--alias:` do esbuild, usado pelo `test`).
`src/main` e `src/preload` seguem com import relativo com extensão `.js`.

## Padrão de modal

Todo diálogo usa `components/Modal.tsx` (`Modal`, `Field`, `Button`,
`inputClass`). O estado do modal vive no `App`, não no componente que abre.
