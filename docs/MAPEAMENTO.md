# Mapeamento técnico — prime-agent 0.7.3

Levantamento feito por inspeção direta da instalação em
`~/.npm-global/lib/node_modules/prime-agent` e por *smoke tests* reais do protocolo.

## 1. Modos de integração disponíveis

| Modo | Comando | Avaliação |
|---|---|---|
| **RPC** | `prime-agent --mode rpc` | **ESCOLHIDO.** Superfície mais rica: modelos, thinking, compactação, bash, fork, export, comandos. |
| ACP | `prime-agent --mode acp` | Padrão aberto, mas só 5 métodos (`initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/close`). Sem troca de modelo/compactação. |
| JSON | `prime-agent --mode json` | One-shot, sem entrada interativa. Serve para batch. |
| SDK | `@earendil-works/pi-coding-agent` | Acopla ao processo Electron; perde isolamento do daemon. |

**Decisão:** RPC como transporte primário, isolado atrás de `RpcClient`
(`src/main/rpc-client.ts`). Trocar para ACP depois exige mexer em um arquivo só.

## 2. Framing — ATENÇÃO

A doc é explícita: JSONL com **LF (`\n`) como único delimitador**.

> "Node `readline` is not protocol-compliant for RPC mode because it also splits
> on `U+2028` and `U+2029`, which are valid inside JSON strings."

Nosso parser (`splitLines`) quebra **apenas** em `\n` e tolera `\r` final.
Nunca usar `readline` nem `split(/\r?\n/u)` com flag unicode.

## 3. Eventos validados em teste real

Teste executado: prompt + execução de célula IPython. 34 linhas, todos os eventos abaixo observados.

```
response              -> ack do comando (id correlacionado)
agent_start
turn_start
message_start/_end    -> mensagem completa (user/assistant)
message_update        -> 16x. Streaming.
tool_execution_start
tool_execution_update -> resultado parcial
tool_execution_end    -> result.details {durationMs,status,stdout,stderr}
turn_end              -> usage + cost consolidados
agent_end             -> array completo de mensagens
```

### Descoberta que simplifica o renderer

`message_update` carrega **o snapshot completo** de `message.content` **e**
o delta em `assistantMessageEvent`. Ou seja:

```json
{"type":"message_update",
 "message":{"role":"assistant","content":[...estado completo...],"usage":{...}},
 "assistantMessageEvent":{"type":"text_delta","contentIndex":1,"delta":"O"}}
```

**Consequência arquitetural:** o renderer usa o *snapshot* como fonte da verdade
e ignora os deltas. Isso torna a renderização idempotente e elimina toda a
classe de bugs de remontagem de delta (ordem, perda, reconexão).

Subtipos de `assistantMessageEvent`:
`thinking_start|thinking_delta|thinking_end`, `text_start|text_delta|text_end`,
`toolcall_start|toolcall_delta|toolcall_end`.

Blocos de `content`: `thinking` (+`thinkingSignature`), `text`, `toolCall` (`{id,name,arguments}`).

## 4. Estado da sessão (`get_state`)

```json
{"model":{...},"thinkingLevel":"medium","isStreaming":false,"isCompacting":false,
 "steeringMode":"one-at-a-time","followUpMode":"one-at-a-time","sessionId":"...",
 "autoCompactionEnabled":true,"messageCount":0,
 "sessionActions":{"queuedCount":0,"steering":[],"followUps":[]},
 "goal":{"active":false,"status":"idle","tokensUsed":0,"timeUsedSeconds":0,"continuationsUsed":0}}
```

Alimenta direto o HUD: modelo, thinking, fila, goal, custo.

## 5. Comandos RPC mapeados

- **Prompt:** `prompt` (com `images[]`, `streamingBehavior: steer|followUp`), `steer`, `follow_up`, `abort`, `new_session`
- **Estado:** `get_state`, `get_messages`
- **Modelo:** `set_model`, `cycle_model`, `get_available_models`
- **Thinking:** `set_thinking_level`, `cycle_thinking_level`
- **Fila:** `set_steering_mode`, `set_follow_up_mode`
- **Compactação:** `compact`, `set_auto_compaction`
- **Retry:** `set_auto_retry`, `abort_retry`
- **Bash:** `bash`, `abort_bash`
- **Sessão:** `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_last_assistant_text`, `set_session_name`
- **Comandos:** `get_commands` (23 skills detectadas neste ambiente)

## 6. Identidade visual oficial

Extraída de `dist/modes/interactive/theme/prime.json`. O tema **default** é `prime`
(não `dark`) — confirmado em `getDefaultTheme()`.

| Token | Hex |
|---|---|
| bg | `#050506` |
| surface | `#0d0d10` |
| panel | `#151518` |
| fg | `#f4f4f5` |
| muted | `#a1a1aa` |
| dim | `#71717a` |
| grid | `#52525b` |
| **primary** | **`#7c6faf`** |
| primarySoft | `#8d7fc0` |
| success | `#7da876` |
| warning | `#f59e0b` |
| error | `#d06f82` |
| info | `#38bdf8` |
| stringMint | `#8ba888` |

Logo: **borboleta Prime** (`PRIME_BUTTERFLY_LOGO`, ASCII em `dist/themes/prime-logo.js`,
origem `assets/brand/prime-butterfly.svg` — SVG não distribuído no pacote npm).
Reconstruímos como SVG vetorial em `resources/brand/`.

## 7. Sessões em disco

`~/.prime/agent/sessions/<uuid>.jsonl` — JSONL, árvore via `id`/`parentId`, **versão 3**.
Primeira linha é o header:

```json
{"type":"session","version":3,"id":"...","timestamp":"...","cwd":"...","rlmDepth":0}
```

A sidebar lê esses arquivos direto (rápido, sem subir worker) e usa `switch_session`
no RPC para abrir de verdade.

## 8. Ambiente alvo

Ubuntu 24.04.3 · Node v22.22.2 · npm 10.9.7 · pnpm disponível · **sem Rust/Bun**.

Por isso **Electron** e não Tauri: Tauri exigiria instalar toolchain Rust +
`webkit2gtk-4.1`, e o *sidecar* de subprocesso ficaria mais complicado que o
`child_process.spawn` nativo do Electron main.

## 9. Árvore de subagentes RLM

O RPC **não** expõe o vínculo pai→filho. A única superfície que expõe é a CLI:

```bash
prime-agent list --json
```

Schema confirmado empiricamente gerando um subagente real (`await rlm(..., name=...)`)
e inspecionando o registro devolvido:

| Campo | Uso na GUI |
|---|---|
| `runtimeKind` | `"top-level"` ou `"subagent"` |
| `rlmDepth` | profundidade (0 = root) |
| `parentActiveSessionId` | **a aresta da árvore** |
| `sessionName` | nome dado no spawn (`name=`) |
| `rlmChildId` | id do filho, ex. `sub-372c6f11` |
| `spawnCode` | código Python que originou o subagente |
| `activity` / `taskState` | `working`/`idle`, `needs_input` |
| `repliedSinceTask` | se o filho já respondeu ao pai |
| `hasRunningRlmChildren` | se há descendentes ativos |
| `messageCount`, `firstMessage`, `model`, `lastActivityAt` | metadados de exibição |

O header do JSONL do filho também carrega o vínculo:

```json
{"type":"session","version":3,"id":"…","parentSession":"…/<pai>.jsonl","rlmDepth":1}
```

Sessões de subagente ficam fora de `sessions/`:
`~/.prime/agent/session-artifacts/<sessão-pai>/<rlmChildId>/<id>.jsonl`

**Implementação:** `src/main/agent-tree.ts` roda `list --json` a cada 3 s (só com
janela visível) e monta a floresta. Nós órfãos — pai já encerrado — sobem para a
raiz em vez de desaparecer.

**Não usado ainda:** o RPC tem `observe` / `unobserve` para assinar os eventos de
outra sessão, entregues como `observed_session_event`. É o caminho para, no
futuro, abrir o transcript ao vivo de um filho dentro da GUI.

## 10. Pastas de conversas

O `prime-agent` não tem conceito de pasta e não deve receber metadado de
apresentação. A organização é só da GUI:

- **Grupos automáticos:** derivados do `cwd` da sessão — na prática, o projeto.
- **Pastas manuais:** criadas pelo usuário; atribuição manual tem precedência.
- **Persistência:** `<userData>/folders.json`, contendo apenas `folders`,
  `assignments` (sessionId → folderId) e `collapsed`. Nenhum conteúdo de
  conversa é copiado.

## 11. Transcript ao vivo via `observe`

Validado com um subagente real em execução.

### Protocolo

```json
{"id":"w1","type":"observe","activeSessionId":"<alvo>"}
```

Resposta: `{ "messages": [...] }` — o histórico completo do alvo.

Eventos seguintes chegam embrulhados, para não se confundirem com os da própria
sessão do cliente RPC:

```json
{"type":"observed_session_event","activeSessionId":"<alvo>","event":{ … }}
{"type":"observed_session_closed","activeSessionId":"<alvo>","error":"…"}
```

Encerrar: `{"type":"unobserve","activeSessionId":"<alvo>"}`

### Duas garantias confirmadas na implementação do agente

1. **Não há janela de perda.** O agente bufferiza os eventos em
   `observation.pendingEvents` até a resposta do `observe` ser entregue
   (`observation.ready`). Só então libera. Ou seja, nada acontece "entre" o
   histórico e o primeiro evento.
2. **`observe` repetido é idempotente.** Se já existe observação para aquele id,
   ele devolve as mensagens atuais sem criar uma segunda subscrição.

### O evento interno tem o mesmo formato do próprio

`event` é um `AgentSessionEvent` idêntico aos da sessão local. Consequência
arquitetural: **o mesmo reducer serve para as duas coisas.** Foi por isso que o
reducer virou uma função pura em `store/transcript.ts`, e o store passou a manter
um `Transcript` para a sessão própria e um por sessão observada.

Tipos internos observados no teste: `message_start/_update/_end`, `turn_start/_end`,
`tool_execution_start/_end`, `agent_end`, `recap_update`.

### Bug encontrado nesse caminho

O histórico (tanto de `observe` quanto de `get_messages`) entrega resultados de
ferramenta como mensagens `role: "toolResult"`:

```json
{"role":"toolResult","toolCallId":"toolu_…","toolName":"ipython",
 "content":[{"type":"text","text":"passo 1\n"}],
 "details":{"durationMs":6,"status":"ok","stdout":"…","stderr":"","kernelRestarted":false}}
```

Eventos `tool_execution_*` **não** são reemitidos. Sem tratar `toolResult`, todo
card de ferramenta de sessão reaberta ficaria preso em "preparando" para sempre —
o que também afetava o botão de abrir sessão da sidebar, não só o observe.
Corrigido em `applyToolResultMessage`.

## 12. `switch_session` recebe `sessionPath`, não `sessionId`

Bug encontrado por inspeção da doc depois de a seleção da sidebar não sair do
lugar. Comprovado por teste direto:

```
{"type":"switch_session","sessionId":"01a01a62-…"}
  -> success:false, "The \"paths[0]\" argument must be of type string"

{"type":"switch_session","sessionPath":"/home/…/01a01a62-….jsonl"}
  -> success:true, {"cancelled":false}   e get_state passa a devolver o novo sessionId
```

Dois efeitos colaterais que também precisaram de tratamento:

1. **Sessão já ativa em outro worker é recusada**
   (`Session is already active in <id>: <path>`). Sem tratar, a GUI ficava muda.
   Hoje vira aviso explícito para o usuário.
2. **`--no-session` zera o histórico.** Num probe com `--no-session`,
   `get_messages` devolveu 0 mensagens após o switch; sem a flag, devolveu as 10
   esperadas. A GUI não usa `--no-session` — mas vale saber ao depurar por CLI.

## 13. Deriva entre o cwd do agente e a raiz do explorador

`bridge:start` sobrescrevia a raiz do explorador mesmo quando a ponte já estava
rodando. Resultado possível: explorador apontando para uma pasta onde o agente
**não** está executando — e o renderer podia recarregar sem reiniciar a ponte.

Correção: o main é a fonte da verdade. Com a ponte de pé, `bridge:start` devolve
o `cwd` real e ignora o pedido; o renderer passa a exibir o que o main devolveu,
em vez do que pediu.

## 14. Uso agregado a partir dos arquivos de sessão

Entradas relevantes do JSONL para contabilizar consumo:

```json
{"type":"message","timestamp":"…","message":{"role":"assistant","model":"claude-opus-5",
  "usage":{"totalTokens":11713,"cost":{"total":0.0823}}}}

{"type":"child_usage_attributed","timestamp":"…",
  "childUsage":{"totalTokens":10224,"cost":{"total":0.0553}},
  "aggregateUsage":{ … }}
```

Dois cuidados:

1. **Somar `child_usage_attributed`.** É o consumo dos subagentes atribuído ao
   pai. Ignorar isso subestima o total em sessões que usam RLM.
2. **Usar `childUsage`, não `aggregateUsage`.** O agregado é cumulativo; somá-lo
   contaria o mesmo consumo várias vezes.

`totalTokens` inclui `cacheRead` e `cacheWrite`, então o número é bem maior que
"tokens de texto" — é consumo real de billing, coerente com o `cost`.
