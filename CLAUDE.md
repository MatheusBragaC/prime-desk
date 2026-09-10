# CLAUDE.md

Instruções operacionais para agentes trabalhando neste repositório.

Convenções de código, aliases de import, padrão de modal e os `npm run check`
estão em **`CONTRIBUTING.md`** — leia antes de escrever código. Este arquivo
cobre o que não é código: como entregar, como verificar e onde as armadilhas já
custaram tempo.

---

## 1. Git: nunca empurre direto na `main`

- **Uma branch por bloco de trabalho**, PR para `main`, e o merge é do usuário.
  Não mergeie você mesmo.
- **Depois de abrir a PR, pare de empurrar naquela branch.** Correção nova nasce
  em branch nova, do começo. Empurrar numa branch com PR aberta já gerou commit
  órfão quatro vezes aqui.
- Nome: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `ci/`, `test/`, `a11y/`.
- **Sem `Co-Authored-By`.** O usuário removeu "claude" dos contribuidores do
  GitHub em 10/09/2026 — foram 33 commits reescritos e force-push. Não recriar.
- Mensagem de commit explica **por que**, com a evidência que sustenta a
  decisão. O corpo é o lugar da medição, do número medido, do caso real.

### Árvore de trabalho compartilhada

Outras sessões podem estar editando **este mesmo diretório** ao mesmo tempo
(já aconteceu: 17 arquivos sendo alterados ao vivo por subagentes de outra
conversa). Antes de qualquer coisa destrutiva — `checkout`, `reset`, `stash`,
`clean` — rode `git status` e olhe.

Se a árvore estiver ocupada, trabalhe num worktree:

```bash
git worktree add -b minha/branch ../prime-desk-wt origin/main
cd ../prime-desk-wt && ln -s ../prime-desk/node_modules node_modules
```

O symlink de `node_modules` faz `typecheck`, `lint`, `test` e `build` rodarem
sem reinstalar. Apague o worktree ao terminar (`git worktree remove`).

---

## 2. Comentário de código: sempre em inglês

**Todo comentário novo é escrito em inglês** — comentário de linha, de bloco e
JSDoc, em qualquer arquivo, em qualquer branch. Sem exceção por tipo de arquivo:
`src/`, `scripts/`, workflows, configuração.

Isso vale para comentário **novo ou reescrito**. Comentário existente em
português não precisa ser traduzido de passagem: tradução em massa junto de
mudança funcional esconde a mudança no diff. Se você já está reescrevendo o
comentário por outro motivo, escreva a versão nova em inglês.

O que **não** muda:

- **Texto de interface** continua no `i18n`, nos três idiomas — nada de string
  visível em inglês cravada no componente (o `check:ui` cobra isso).
- **Mensagem de commit e descrição de PR** seguem em português, como o resto do
  histórico deste repositório.

A regra de conteúdo do `CONTRIBUTING.md` continua valendo por cima do idioma:
comentário explica **o porquê**, não o quê. Comentário em inglês que narra o
código é tão inútil quanto em português.

```ts
// Bad: narrates the code, and in any language it adds nothing.
// Increment the counter
count += 1

// Good: says why, which the code cannot.
// Counts actions, not messages: two steering entries can arrive in one turn.
count += 1
```

## 3. Verificação: o Electron não sobe aqui

`npm run dev` **não funciona** no shell do agente (sem GPU e sem `/dev/shm`
utilizável: o browser-level CDP responde, mas `Runtime.evaluate` estoura). Para
ver interface, use o andaime:

```bash
npm run build
node scripts/ui-harness.mjs 5199    # serve out/renderer com window.prime falso
```

Ele injeta o stub como **arquivo** (`/__stub.js`), não inline — a CSP do app é
`script-src 'self'` e bloqueia script embutido, corretamente.

Cenários por querystring e ganchos no `window.__harness`:

| Recurso | Como |
|---|---|
| Turno em curso | `?streaming=1` |
| Falha ao copiar | `?copyfail=1` |
| Emitir evento do agente | `window.__harness.emit('agent:event', {...})` |
| Chamadas a `markBridge` | `window.__harness.marcados` |

**Limites do andaime, conhecidos:** `requestAnimationFrame` não roda e
`setInterval` é estrangulado no painel escondido — qualquer coisa medida em
segundos (cronômetro, `useWindowWidth`) não avança ali. Teste isso com estado
inicial (recarregar já estreito) ou com função pura.

**O stub mente por omissão.** Já aconteceu três vezes: `transcript` devolvia
`messages` onde o código lê `entries`; faltavam 20 dos 61 métodos do preload;
`sessionId` não casava com nenhuma sessão, então nenhuma linha ficava ativa.
Se algo não aparece na tela, **desconfie do stub antes do código.**

---

## 4. Testes: lógica pura, sem framework

`npm run test` roda `scripts/test/run.mjs`, que empacota cada módulo com esbuild
e importa. Nove suítes hoje. Para adicionar uma, acrescente ao array `SUITES`:

```js
{ test: './minha.test.mjs', src: 'src/.../modulo.ts',
  needsShims: false,      // true injeta casca de react/store
  platform: 'node',       // para módulo do main que usa node:fs
  shims: { 'session-catalog.js': 'export const paths = {...}' } }
```

A suíte exporta `default function run(mod)` devolvendo boolean (ou Promise dele).

**Escreva o teste com o caso real que motivou o código**, não com um exemplo
inventado: `fixtures-plano.mjs` guarda um plano de 9973 caracteres de uma sessão
de verdade, porque é ele que a heurística precisa continuar reconhecendo.

---

## 5. Contratos que quebram em silêncio

Cada item aqui já causou um defeito invisível neste repo.

- **Allowlist de RPC** (`src/main/index.ts`, `RPC_SEND_ALLOWED` /
  `RPC_FIRE_ALLOWED`). Comando fora dela é recusado com `{ok: false}`, o
  `rpc()` engole num `console.warn`, e o sintoma na tela é indistinguível do
  normal. `get_session_stats` ficou meses quebrado assim. `npm run check:rpc`
  cruza os dois lados — rode sempre.
- **i18n em três dicionários** (`src/renderer/src/i18n/index.ts`: `pt` ~19,
  `en` ~457, `es` ~895), **435 chaves cada, na mesma ordem**. Faltar em um
  idioma não quebra o build.
- **Janela sem moldura.** Controle sem `no-drag` dentro de `drag-region` vira
  área de arraste e para de responder ao clique.
- **`{ok, error}` no IPC.** O main devolve envelope em vez de lançar. Quem
  consome precisa checar; `lib/ipc.ts` (`unwrap`) traduz para exceção.

---

## 6. Não invente o `prime-agent` — vá ler

Versão instalada: **0.9.4**. O fonte compilado está em
`~/.npm-global/lib/node_modules/prime-agent/dist/` e **é a fonte da verdade**,
acima de qualquer documentação, inclusive a deste repo.

Isso já evitou erro real várias vezes:

- `whisper-server` assume `--language en`; sem `auto`, transcreve português como
  inglês.
- O manifesto de update devolve `v0.9.1` **com** o prefixo `v`; comparar string
  crua diz que o instalado é mais novo.
- A gramática de agendamento é assimétrica: `in` aceita dias, `every` não.
- **Artifacts não existe na API.** É recurso do produto de chat do Claude; os
  betas em uso no SDK empacotado não incluem nenhum relativo a isso.
- **`prime-agent list --json` só vê sessão residente no daemon.** O app sobe
  cada conversa como `--mode rpc` solto, então o comando devolve
  `{"sessions": []}` mesmo com subagentes trabalhando. A árvore de agentes vem
  do disco (`src/main/agent-tree-disk.ts`, lendo `session-artifacts/`).

`docs/MAPEAMENTO.md` (41 seções) é o mapa empírico do agente — comportamento
confirmado com execução, não deduzido. `docs/auditoria/` tem a auditoria de
front-end e a ordem de correção sugerida.

---

## 7. Empacotar e publicar

```bash
# .deb local para teste
npx electron-builder --linux deb -c.npmRebuild=false
```

`-c.npmRebuild=false` é necessário: o `@electron/rebuild` fica pendurado
indefinidamente em "preparing node-pty", com 0% de CPU. O `pty.node` local já
está compilado e usa Node-API, estável entre versões — recompilar não acrescenta
nada. O CI contorna de outro jeito (ver `.github/workflows/release.yml`).

Antes de entregar um pacote, **inspecione o que está dentro dele**, não confie
no build:

```bash
dpkg-deb -x release/prime-desk_X.Y.Z_amd64.deb /tmp/insp
npx asar extract "/tmp/insp/opt/Prime Desk/resources/app.asar" /tmp/asar
```

Confira o caminho **relativo** do worklet (`addModule("./pcm-worklet.js")` — o
absoluto funcionava em dev e quebrava no pacote), o `pty.node` fora do asar, e a
presença do recurso que motivou aquele pacote.

**Release:** empurrar tag `v*` dispara o workflow, que compila e publica `.deb`,
AppImage, `.dmg` e `.zip` na Release. Faça isso só quando o usuário pedir.

---

## 8. Postura

- **Verifique contra o real**, não contra a memória. Rodar o binário, ler o
  arquivo, medir. Quase todo achado bom desta base veio daí.
- **Ausência de dado não é zero.** Um `$0.00` onde o agente não relatou nada é
  pior que campo vazio. O mesmo vale para "0 sessões ativas" com um turno
  rodando.
- **Não afirme que funciona sem ter visto funcionar.** A árvore de agentes foi
  entregue duas vezes sem funcionar porque cada peça foi verificada isolada e a
  corrente inteira nunca.
- **Copy não mente.** "Sessões ativas" não pode contar subagente concluído;
  "respondeu" não pode significar "terminou".
- Relate falha com a saída do comando. Se pulou etapa, diga.
