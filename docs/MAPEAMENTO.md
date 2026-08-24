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

## 15. Toda inicialização do agente cria um arquivo de sessão vazio

Sintoma relatado: a sidebar enchia de "Sessão sem título".

Causa: subir `prime-agent --mode rpc` **cria a sessão imediatamente**, antes de
qualquer mensagem. O arquivo nasce com header e mais nada:

```json
{"type":"session","version":3,"id":"…","cwd":"…","rlmDepth":0}
{"type":"model_change", …}
{"type":"thinking_level_change", …}
{"type":"service_tier_change", …}
{"type":"session_state","state":{"status":"active"}}
```

Zero entradas `message`. Como o título vem da primeira mensagem do usuário, todas
caíam no fallback "Sessão sem título". Cada abertura do app somava mais uma.

O daemon poda essas sessões quando o worker sai, mas enquanto o app roda elas
ficam visíveis.

**Correção:** o catálogo ignora sessões com zero mensagens. A conversa entra na
lista quando ganha conteúdo — e, para ela não ficar invisível até um refresh
manual, `agent_end` dispara a recarga do catálogo.

**Bônus:** o título passou a preferir `session_info.name` (definido por
`set_session_name` ou `/title`) sobre o texto da primeira mensagem.

## 16. Modo print (`-p`) não retorna quando lançado do main do Electron

Ao implementar o título automático, `execFile('prime-agent', ['-p', …])` a partir
do processo main **nunca completa**: estoura o timeout (testado com 25 s e 90 s)
e o stderr volta vazio.

O mesmo comando, com os mesmos argumentos, responde em ~4 s a partir do shell.
Descartado: stdin como pipe aberto (testado, não é), binário fora do PATH (daria
ENOENT imediato) e execFile em geral (o `git` do chip de branch funciona).

**Solução:** gerar o título por um cliente RPC efêmero — `--mode rpc` é o caminho
que a ponte principal já usa e comprovadamente funciona sob Electron. Sobe com
`--no-session --no-tools --no-skills --no-extensions --no-context-files`, manda um
`prompt`, espera `agent_end`, lê `get_last_assistant_text` e encerra. ~4 s.

## 17. Modificador de opacidade do Tailwind exige canais, não hex

Sintoma: a borda do botão "Nova conversa" aparecia branca.

Causa: as cores do tema estavam declaradas como `primary: 'var(--p-primary)'`,
com a variável guardando `#7c6faf`. O Tailwind **não** consegue aplicar
`/25` sobre isso, então `border-primary/25` não gera regra alguma e o elemento
cai no `border-color` do preflight — cinza-200, que sobre fundo escuro lê como
branco. O mesmo valia para `bg-primary/[0.11]`, que simplesmente sumia.

Não era um caso isolado: **mais de 40 usos** de opacidade em cores do tema
estavam sendo descartados em silêncio.

**Correção:** manter o hex para uso direto em CSS/SVG e adicionar canais
separados para o Tailwind:

```css
--p-primary: #7c6faf;          /* uso direto */
--p-primary-rgb: 124 111 175;  /* canais */
```

```js
primary: 'rgb(var(--p-primary-rgb) / <alpha-value>)'
```

## 18. "Travamento" no streaming não era travamento

Relato: as respostas pareciam travar em vez de escorrer.

Medição durante um turno real, com `PerformanceObserver` e amostragem de
`requestAnimationFrame`:

| Métrica | Valor |
|---|---|
| Quadros amostrados | 1801 |
| p50 / p95 / p99 | 17 / 17 / 17 ms |
| Pior quadro | 33 ms |
| Quadros acima de 50 ms | 0 |
| Longtasks (>50 ms) | 0 |

Ou seja: 60fps estáveis, sem bloqueio de thread. O problema não era desempenho —
era **o texto chegando do modelo em rajadas** e sendo pintado de uma vez, o que
lê como solavanco.

**Correção:** `useSmoothText` revela o texto por quadro, com passo proporcional
ao atraso acumulado (`max(2, backlog/5)`). Medindo o crescimento do texto a cada
100 ms depois da mudança:

- incremento mediano: 36 caracteres
- maior incremento: 100 caracteres
- rajadas acima de 200 caracteres: **0**

Junto disso, o *syntax highlight* passou a rodar só quando o bloco termina —
destacar a cada quadro é trabalho jogado fora.

## 19. Execução remota existe, mas via extensão

O prime-agent **não** tem modo remoto embutido (nenhuma flag de SSH, nuvem ou
host no `--help`). O que existe é a extensão de exemplo
`examples/extensions/ssh.ts`, que troca as operações das ferramentas `bash` e
`edit` por execução sobre SSH:

```bash
prime-agent -e <caminho>/examples/extensions/ssh.ts --ssh user@host[:/caminho]
```

Requer autenticação por chave — pedido de senha travaria o agente.

Por isso o menu do chip de execução oferece **Local** e **SSH**, e nada além:
"Cloud" e "Remote Control" não têm contrapartida no prime-agent.

## 20. Capturas de tela do Electron podem vir obsoletas

`Page.captureScreenshot` devolveu quadros pretos/desatualizados enquanto a janela
estava atrás de outra: o compositor não repinta janela ocluída. O DOM, medido por
`getBoundingClientRect` e `getComputedStyle`, mostrava o elemento correto.

Use `fromSurface: false` para capturar a partir do renderer em vez da superfície
do compositor. Vale para qualquer diagnóstico visual com a janela em segundo
plano — sem isso, dá para concluir que um elemento "não existe" quando ele está
lá.

## 21. Autenticação exigida do usuário final

O `prime-agent` não exige conta na Prime Intellect. Ele exige credencial de um
**provedor de modelo**, por um destes caminhos (`docs/quickstart.md` e
`docs/providers.md`):

- `/login` com provedor de assinatura: Claude Pro/Max, ChatGPT Plus/Pro (Codex),
  GitHub Copilot;
- chave de API por variável de ambiente ou gravada em `~/.prime/agent/auth.json`.

Detalhe com impacto financeiro, citado na doc oficial: uso de assinatura
Claude Pro/Max em ferramenta de terceiro **é cobrado por token como "extra
usage"** e não abate do limite do plano.

Formato de `auth.json` neste ambiente (apenas o formato, sem valores):

```json
{ "anthropic": { "type": "...", "refresh": "...", "access": "...", "expires": 0 } }
```

Ou seja, OAuth de assinatura. A GUI não lê nem replica esse arquivo.

## 22. Ícone da barra de tarefas depende do `.desktop`, não da janela

`BrowserWindow({ icon })` e `win.setIcon()` afetam a janela, mas o shell do Linux
resolve o ícone da barra/dock casando o `WM_CLASS` da janela com um arquivo
`.desktop` instalado.

Verificado no app empacotado:

```
WM_CLASS(STRING) = "prime-desk", "prime-desk"
```

que casa com `StartupWMClass=prime-desk` no `.desktop`. Instalando em
`~/.local/share/applications` mais os ícones em `~/.local/share/icons/hicolor`,
o ícone correto aparece sem sudo (`npm run desktop:install`).

## 23. Excluir a conversa aberta exige trocar de sessão antes

O worker do daemon mantém o arquivo da sessão ativa carregado. Apagar o `.jsonl`
da conversa aberta não surtia efeito visível.

Correção: quando o alvo é a sessão ativa, o app chama `new_session` primeiro —
o worker passa a apontar para uma sessão nova — e só então remove o arquivo.
Validado: o `.jsonl` sumiu do disco, a sidebar atualizou e o `sessionId` mudou.

## 24. `gnome-terminal` falha em silêncio e sai com código 0

Ao abrir um terminal para o `/login`, o botão não fazia nada. O comando usado era:

```bash
gnome-terminal -- bash -lc 'prime-agent; exec bash'
```

Ele imprime no stderr

```
# Error creating terminal: Failed to get screen from object path /org/gnome/Terminal/screen/…
```

e ainda assim **sai com código 0**. Como o app só olhava o código de saída, achava
que tinha dado certo.

O cliente do gnome-terminal fala com o `gnome-terminal-server` por D-Bus; quando
esse canal está degradado, a criação da janela falha. `--disable-factory` faz o
processo abrir a própria janela, sem passar pelo servidor — e aí funciona.

Testado nesta máquina:

| Invocação | Resultado |
|---|---|
| `gnome-terminal --` | erro no stderr, nenhuma janela |
| `gnome-terminal --window --` | erro no stderr, nenhuma janela |
| `setsid gnome-terminal --` | erro no stderr, nenhuma janela |
| `gnome-terminal --disable-factory --` | **abre normalmente** |

**Correções:** usar `--disable-factory`; validar o lançamento observando o stderr
por ~1,4 s em vez de confiar no código de saída; percorrer mais candidatos
(ptyxis, konsole, xfce4-terminal, kitty, alacritty, xterm); e, se todos falharem,
mostrar o comando para o usuário rodar à mão.

Detalhe de diagnóstico: `pgrep -c gnome-terminal-server` retorna 0 mesmo com o
servidor no ar, porque `comm` é truncado em 15 caracteres. Use `pgrep -f`.

## 25. Login OAuth trava em silêncio quando a porta 53692 está ocupada

Sintoma: no `/login`, o Enter sobre "Anthropic (Claude Pro/Max) — subscription"
não faz nada. Nem erro, nem URL, nem timeout.

Reproduzido num PTY controlado: Enter no item 1 (Prime Inference) avança
normalmente; Enter no item 2 (Anthropic) não produz saída alguma nem após 30 s.

Causa, lendo o bundle: `loginAnthropic` chama `startCallbackServer(verifier)`
**antes** de `options.onAuth(...)`. O servidor escuta em

```js
CALLBACK_PORT = 53692
REDIRECT_URI  = `http://localhost:${CALLBACK_PORT}/callback`
```

Se o bind falhar, a promessa nunca resolve e nada é exibido — o `onAuth`, que é
quem mostra o link, sequer chega a rodar.

Na máquina de teste a porta estava presa:

```
LISTEN 127.0.0.1:53692  users:(("prime-agent",pid=166799))
```

Um `prime-agent` que iniciou um login e ficou aguardando o retorno do navegador
mantém a porta ocupada — o `finally { server.server.close() }` só roda quando o
fluxo termina ou é abortado, não enquanto ele espera.

**Mitigação no Prime Desk:** antes de abrir o terminal de login, o app testa o
bind em `127.0.0.1:53692`. Ocupada, ele explica o que está acontecendo e mostra o
comando para encerrar os processos pendentes, em vez de abrir mais uma janela que
também não vai funcionar.

## 26. Tela sem barra de título precisa de região de arraste própria

Com `titleBarStyle: 'hidden'`, só é possível mover a janela por elementos com
`-webkit-app-region: drag`. A tela de onboarding não renderiza a StatusBar nem a
sidebar, que eram os únicos lugares com essa propriedade — resultado: janela
imóvel durante toda a primeira execução.

Corrigido com uma faixa de arraste no topo da própria tela de onboarding.

## 27. Detecção automática do fim do login

O `/login` acontece fora do app, num terminal. Exigir um clique em "já
autentiquei" é atrito desnecessário: o app consegue perceber sozinho.

`startEnvWatch` combina duas fontes, porque nenhuma é confiável isolada:

- **`fs.watch` no diretório** `~/.prime/agent`, e não no arquivo. O `auth.json` é
  **regravado**, não editado no lugar, então um watcher preso ao arquivo perde o
  evento quando o inode é substituído.
- **Laço de 3 s** como rede de segurança, já que `fs.watch` não é garantido em
  todo sistema de arquivos nem em todo sistema operacional.

O laço lê **apenas** o `auth.json` e as variáveis de ambiente — nada de `which`
nem `--version`, que são caros. A verificação completa só roda quando a
assinatura do estado muda de fato, e o evento só é emitido nessa transição.

Medido num `HOME` isolado: da gravação do arquivo até a tela avançar,
**1,0 s**.

## 28. Markdown parcial e ausência de sinal no início do turno

Dois incômodos observados em uso real.

**1. Marcadores vazando na tela.** O snapshot chega no meio de um par, então o
texto renderizado mostrava `**Dados e sc` com os asteriscos à mostra até o modelo
fechar o negrito. `balanceMarkdown` fecha provisoriamente o que está aberto
(`**`, `*`, `~~`, crase, cerca de código) apenas para a renderização enquanto o
turno corre — o texto guardado não muda.

Detalhes que importam: a ordem é `**` antes de `*`, senão o par de negrito é
contado como itálico; dentro de bloco de código só a cerca é fechada, porque ali
não existe ênfase; e link começado sem fechar é ocultado até completar, em vez de
aparecer como texto solto.

**2. Nenhum sinal onde o usuário está olhando.** Entre enviar a mensagem e o
primeiro token, o único indício era o "Executando" no topo da janela. Agora um
bloco com a borboleta e três pontos ocupa exatamente o lugar onde a resposta vai
nascer.

A condição não é só "está transmitindo": o bloco também aparece quando a
mensagem do assistente já existe mas ainda está sem conteúdo visível — sem isso,
haveria uma janela de silêncio entre `message_start` e o primeiro delta.

## 29. Distribuição: por que `curl` sozinho não basta no Linux

Testado com o AppImage recém-gerado nesta máquina:

```
FATAL:setuid_sandbox_host.cc(163) The SUID sandbox helper binary was found,
but is not configured correctly. …/chrome-sandbox is owned by root and mode 4755
```

O Ubuntu 24.04 define `kernel.apparmor_restrict_unprivileged_userns=1`. Nesse
regime o Chromium precisa de **uma** destas duas coisas: um perfil AppArmor que
conceda `userns` ao binário, ou um `chrome-sandbox` com dono root e modo 4755.
O AppImage monta somente leitura em `/tmp` e não pode ter nenhuma das duas.

### A armadilha no postinst padrão

O `postinst` gerado pelo electron-builder decide assim:

```bash
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 chrome-sandbox   # sem userns: usa setuid
else
    chmod 0755 chrome-sandbox   # com userns: dispensa setuid
fi
```

Medido aqui: `unshare --user true` **retorna sucesso** para usuário comum mesmo
com a restrição ativa, porque o Ubuntu distribui um perfil AppArmor para o
próprio `unshare`. O teste conclui que namespaces funcionam, deixa o sandbox sem
setuid — e o app não abre.

**Correção:** `afterInstall` próprio que instala um perfil AppArmor para
`/opt/Prime Desk/prime-desk`, como fazem Chrome e VS Code, e só recorre ao setuid
quando não há AppArmor. O `afterRemove` desfaz.

Consequência para a documentação: no Linux o `.deb` é o canal recomendado; o
AppImage funciona, mas precisa de `--no-sandbox` nessas distros — e o instalador
avisa em vez de entregar um atalho que não abre.
