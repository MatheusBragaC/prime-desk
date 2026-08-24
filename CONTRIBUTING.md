# Contribuindo

## Ambiente

```bash
npm install
npm run fix-sandbox   # Linux, uma vez
npm run dev
```

## Antes de abrir PR

```bash
npm run typecheck
npm run build
```

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
