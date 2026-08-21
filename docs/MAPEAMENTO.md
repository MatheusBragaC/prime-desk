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
