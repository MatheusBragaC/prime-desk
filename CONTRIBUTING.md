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

## Padrão de modal

Todo diálogo usa `components/Modal.tsx` (`Modal`, `Field`, `Button`,
`inputClass`). O estado do modal vive no `App`, não no componente que abre.
