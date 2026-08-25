# Redesign visual — paridade com Claude Desktop, identidade Prime

Análise do estado atual (`fix/security-hardening`, e18f474) e especificação do
alvo. Princípio: **copiar o *comportamento visual* do Claude Desktop, não a
paleta dele.** As cores continuam sendo as do tema `prime` do próprio
`prime-agent` (`dist/modes/interactive/theme/prime.json`) — o que muda é
tipografia, ritmo, hierarquia e quantidade de cromo na tela.

---

## 1. Diagnóstico — por que ainda não parece o Claude Desktop

| # | Achado | Evidência | Impacto |
|---|---|---|---|
| 1 | **Nenhuma fonte é embutida** | `theme.css` pede `Inter` e `JetBrains Mono`; não há `@font-face`, nem `.woff2` no repo, e o CSP (`default-src 'self'`, sem `font-src`) bloqueia fonte remota. `fc-list` nesta máquina: 0 Inter, 0 JetBrains Mono. | **Crítico.** O app roda hoje na sans padrão do sistema. Metade da "cara" do Claude Desktop é tipografia. |
| 2 | Escala tipográfica fragmentada | **21** tamanhos distintos (`grep -rhoE "text-\[[0-9.]+px\]" src/renderer | sort -u`): 8, 10, 10.5, 10.8, 11, 11.3, 11.5, 11.8, 12, 12.2, 12.3, 12.5, 12.6, 12.8, 13, 13.5, 14, 14.5, 16, 20, 21 px. | Alto. Sem escala, nada "assenta". |
| 3 | Cromo demais no topo | `StatusBar.tsx` mostra 6 indicadores permanentes (status, tokens, barra de contexto, custo, meta, compactar). O Claude Desktop deixa o topo praticamente vazio. | Alto. Lê como IDE/dashboard, não como app de conversa. |
| 4 | Avatar em toda resposta | `Message.tsx:88` — caixa 28×28 com a borboleta a cada turno do assistente. O Claude Desktop **não** usa avatar: o texto do assistente é texto puro sobre a tela. | Alto. |
| 5 | Coluna larga e turnos apertados | `App.tsx` usa `max-w-[860px]`; espaço entre turnos `py-2.5` (10 px). Claude Desktop: coluna ~760 px, respiro ~28–32 px entre turnos. | Alto. |
| 6 | Composer com controles **fora** da caixa | `Composer.tsx:~560` — anexo/comandos/modelo/thinking numa linha abaixo da caixa; envio é um quadrado fantasma de 28 px. No Claude Desktop tudo mora **dentro** da caixa e o envio é um círculo preenchido com a cor de destaque. | Alto. |
| 7 | Tela inicial é um dashboard | `Welcome.tsx` — 8 tiles + heatmap. Claude Desktop abre com saudação em serifa + composer centralizado, e nada mais. | Médio-alto. |
| 8 | Bordas visíveis separando painéis | `border-r border-white/[0.06]` na sidebar, `border-b` na StatusBar, borda em cada chip, tile e card. Claude Desktop separa por **tom**, quase nunca por linha. | Médio. |
| 9 | Contraste de fundo alto demais | `--p-bg: #050506` é preto puro. Isso dá leitura de terminal. O Claude Desktop usa um carvão médio para que o cromo possa sumir. | Médio. |
| 10 | Tool cards coloridos por status | `ToolCard.tsx` pinta o fundo inteiro de verde/vermelho/roxo. Claude Desktop usa **um** card neutro e colore só o ícone de status. | Médio. |
| 11 | Raios ad hoc | `rounded-[2px|8px|9px|10px|12px]` misturados com `rounded-md/lg/xl` do Tailwind. | Médio. |
| 12 | Ícones em 8 tamanhos diferentes | **17** valores de `size`: 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 17, 18, 19, 26, 44, 46. Claude Desktop é uniforme em ~16 px. | Médio. |
| 13 | Scrollbar permanente de 10 px | `theme.css` — trilho sempre visível com borda de 2 px. Claude Desktop usa scrollbar fina que aparece no hover. | Baixo-médio. |
| 14 | Só tema escuro | Não há `prefers-color-scheme` nem alternador. | Baixo (fase futura). |

---

## 2. O que já está certo — não mexer

- Bolha do usuário à direita, com canto inferior direito cortado (`rounded-br-[5px]`) — igual ao Claude Desktop.
- Revelação suave do texto (`useSmoothText` + `balanceMarkdown`) e cursor pulsante.
- Bloco de raciocínio colapsável, discreto, sem moldura.
- Sidebar com agrupamento, `⋯` no hover, pin, arquivar.
- Paleta autêntica: o hex vem do tema `prime` do agente, não de invenção.
- Marca vetorial própria (`Butterfly.tsx`) usando as variáveis do tema.
- Painéis redimensionáveis com duplo clique para restaurar.

---

## 3. Especificação do alvo

### 3.1 Tokens — substituir o topo de `src/renderer/src/styles/theme.css`

```css
:root {
  /* Neutros: mesma família Prime, escada elevada para que as bordas possam sumir */
  --p-bg:        #0b0b0f;   /* era #050506 */
  --p-surface:   #121218;   /* era #0d0d10 */
  --p-panel:     #1a1a21;   /* era #151518 */
  --p-elevated:  #22222a;   /* novo: menus, popovers */
  --p-line:      rgba(255,255,255,.055);

  --p-fg:    #f2f2f4;
  --p-muted: #a3a3ae;
  --p-dim:   #74747f;

  /* Destaque: um só, usado com parcimônia */
  --p-primary:      #7c6faf;
  --p-primary-soft: #8d7fc0;

  /* Tipografia */
  --font-display: 'Newsreader', Georgia, 'Times New Roman', serif;
  --font-sans:    'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  --text-xs:      11.5px;  /* metadados, rótulos */
  --text-sm:      13px;    /* cromo, sidebar, chips */
  --text-base:    15px;    /* corpo da conversa */
  --text-lg:      18px;
  --text-xl:      24px;
  --text-display: 30px;    /* saudação, serifa */

  --leading-body: 1.68;
  --leading-ui:   1.45;

  /* Raio */
  --r-xs: 6px; --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 24px;

  /* Ritmo da conversa */
  --col: 760px;
  --turn-gap: 28px;
  --titlebar: 44px;
}
```

Regra: **nenhum `text-[12.6px]` novo.** Tudo passa a referenciar as variáveis
(via `fontSize` no `tailwind.config.js`, apontando para os tokens).

### 3.2 Fontes — embutir, não linkar

O CSP não permite CDN. Baixar para `src/renderer/src/assets/fonts/`:

- `InterVariable.woff2` (SIL OFL)
- `Newsreader-Variable.woff2` (SIL OFL) — a serifa de display; é a alternativa
  aberta mais próxima da Copernicus usada pelo Claude. Alternativa: Source Serif 4.
- `JetBrainsMono-Regular.woff2` + `-Bold.woff2` (SIL OFL)

Declarar com `@font-face` e `font-display: block` (evita FOUT no arranque de app
desktop). Vite embute o hash e o CSP `'self'` já cobre.

> Sem este passo, qualquer outro ajuste rende pouco: a fonte é o item de maior
> retorno da lista inteira.

### 3.3 Layout da conversa

| Item | Hoje | Alvo |
|---|---|---|
| Largura da coluna | 860 px | `var(--col)` = 760 px |
| Espaço entre turnos | 10 px | 28 px (`--turn-gap`) |
| Avatar do assistente | caixa 28 px com borboleta | removido; o texto ocupa a coluna inteira |
| Corpo da resposta | 14.5 px / 1.72 | `--text-base` 15 px / 1.68 |
| Bolha do usuário | 76% da largura, `--p-user-bg` | mantida; largura máx. 82%, raio `--r-lg` |
| Metadados (tokens/custo) | aparecem no hover | mantido, `--text-xs`, `--p-dim` |

Sem avatar, a identidade Prime aparece onde importa: marca na sidebar, borboleta
na tela inicial, lavanda no cursor de streaming e no botão de envio.

### 3.4 Composer

```
┌─────────────────────────────────────────────────────┐  raio --r-xl (24px)
│  Como posso ajudar?                                 │  --text-base, placeholder --p-dim
│                                                     │
│  [+]  [⌘]                    Thinking ▾  Modelo ▾ ( ↑ )│  ← tudo DENTRO da caixa
└─────────────────────────────────────────────────────┘
```

- Borda `--p-line`; no foco vira `rgba(124,111,175,.45)`. Sem glow.
- Botão de envio: círculo 32 px, fundo `--p-primary`, ícone `ArrowUp` branco
  16 px. Desabilitado: fundo `--p-elevated`, ícone `--p-dim`. Streaming: quadrado
  de parar, mesmo círculo, fundo `--p-elevated` com ícone `--p-fg`.
- Chips de contexto (Local / pasta / branch / Arquivos) sobem para uma linha
  acima da caixa, sem borda — só texto `--text-xs` em `--p-dim` com separador
  `·`, e viram botões só no hover. Hoje são 4 pílulas com borda competindo com o
  composer.
- Gradiente de fade acima do composer: manter, mas partindo de `--p-bg`.

### 3.5 Cromo (StatusBar + Sidebar)

**StatusBar** passa a ter três coisas: título da conversa à esquerda, e à direita
um indicador único de contexto (o anel/porcentagem) e o `⋯`. Tokens, custo,
meta ativa e "compactar" vão para o popover desse indicador. Sem `border-b` — a
separação vem do tom (`--p-surface` na sidebar, `--p-bg` no palco).

**Sidebar**:
- "Nova conversa" deixa de ser botão preenchido com borda: vira linha de texto
  com ícone (`SquarePen`, 16 px), `--text-sm`, hover `--p-elevated`, raio `--r-sm`.
- A contagem "N conversas", o recarregar e o olho de arquivadas descem para o
  `⋯` do cabeçalho.
- Linhas de sessão: altura 32 px, raio `--r-sm`, ativa = `--p-elevated` sem
  ponto colorido; o ponto some (o destaque é o fundo).
- Sem `border-r`.

### 3.6 Tool cards e raciocínio

- Um só fundo: `--p-surface`, borda `--p-line`, raio `--r-md`. Nada de verde ou
  vermelho no fundo.
- Status só no ícone à direita: `Check` em `--p-success`, `X` em `--p-error`,
  `Loader2` em `--p-primary`.
- Cabeçalho colapsado em `--text-sm` mono, truncado, com duração em `--p-dim`.
- Expandido: `max-height: 380px` com fade no fim, `--text-sm` mono.
- Bloco de raciocínio: já está bom; só trocar o tamanho para `--text-sm` e a cor
  para `--p-dim`.

### 3.7 Tela inicial

```
                     [ borboleta 40px ]

              Boa noite, Matheus            ← --font-display, --text-display
       O que vamos construir hoje?          ← --text-base, --p-muted

        ┌──────────────────────────┐
        │  Como posso ajudar?      │        ← o mesmo composer, centralizado
        └──────────────────────────┘

        Recentes ·  conversa 1  conversa 2  conversa 3
```

O painel de uso não some — vira um link discreto ("Ver uso") que abre o mesmo
componente `Welcome`/`UsagePanel` em modal ou numa aba própria. Ele é bom demais
para jogar fora, mas não é o que o Claude Desktop mostra ao abrir.

### 3.8 Movimento

- `fade-up`: reduzir de 6 px / 280 ms para 2 px / 160 ms.
- Manter `useSmoothText`; reduzir o cursor para 1,5 px.
- Tirar `animate-pulse-soft` do avatar (o avatar sai) e dos pontos de status —
  sobra pulsação só no cursor e no indicador de streaming.

### 3.9 Scrollbars e ícones

- Scrollbar: 8 px, `background: transparent`, polegar `rgba(255,255,255,.12)`
  só no `:hover` do contêiner.
- Ícones: dois tamanhos, 16 px (padrão) e 14 px (dentro de linhas densas da
  sidebar). `strokeWidth={1.75}`.

---

## 4. Ordem de execução

| Fase | Escopo | Arquivos | Estado |
|---|---|---|---|
| **1** | Fontes embutidas + tokens + escala de tipo | `fonts.css`, `theme.css`, `tailwind.config.js`, `assets/fonts/` | **feito** |
| **2** | Ritmo da conversa: coluna 760, gap 28, sem avatar | `App.tsx`, `Message.tsx`, `PendingBubble.tsx` | **feito** |
| **3** | Composer no formato Claude | `Composer.tsx` | **feito** |
| **4** | Cromo: StatusBar silenciosa, sidebar demovida, sem bordas | `StatusBar.tsx`, `Sidebar.tsx` | **feito** |
| **5** | Tool card neutro + raciocínio | `ToolCard.tsx`, `ThinkingBlock.tsx`, `transcript.ts` | **feito** |
| **6** | Tela inicial com saudação; uso vira modal | `Welcome.tsx`, novo `UsagePanel.tsx` | **feito** |
| **7** | Ícones e movimento (scrollbars já feitas na fase 1) | varredura | **feito** |
| **8** | Tema claro (opcional) | tokens duplicados sob `[data-theme]` | futuro |

### O que a execução das fases 1–4 mudou, em números

- **283 KB** de fontes entram no bundle (Inter, Newsreader e JetBrains Mono
  variáveis, só os subconjuntos latin e latin-ext).
- **144** classes `text-[Npx]` arbitrárias substituídas pelos sete degraus da
  escala. Sobraram duas ocorrências de `text-[8px]`, ambas deliberadas: o
  contador de subagentes dentro de um círculo de 12 px e o eixo do heatmap em
  células de 11 px — 10.5 px não caberia em nenhum dos dois.
- **48** hairlines com cinco opacidades diferentes (0.05 a 0.1) unificadas em
  `var(--p-line)`.
- Bordas estruturais removidas entre sidebar e palco, e sob a StatusBar.
- Tokens, custo, janela de contexto e meta saíram da barra de título para um
  popover atrás de um anel de contexto — de seis indicadores permanentes para um.

### Validação visual

Feita com o app rodando (`npm run dev`), dirigido por XTEST e capturado janela a
janela. Conferidos: tela inicial, conversa carregada do disco, bolha do usuário
com anexo de imagem, bloco de raciocínio, paleta de comandos, popover de
métricas, seletor de modelo, seletor de thinking, painel de arquivos, árvore de
agentes e a janela estreitada para 900 px.

Três defeitos encontrados e corrigidos:

1. **Listas de markdown sem marcador** — o preflight do Tailwind zera
   `list-style` em toda `ul`/`ol`, e `.md ul` só definia margem e recuo. As
   listas apareciam apenas indentadas, sem bolinha nem número. As regras
   `.md ul li::marker` já existiam e nunca tinham tido efeito. **Bug anterior ao
   redesign**, não regressão dele. Corrigido com `list-style` explícito, mais
   `circle` e `lower-alpha` para o segundo nível.
2. **Popover de métricas quebrando em duas linhas** — "Accumulated turn tokens"
   empurrava o valor para baixo dentro dos 248 px. O rótulo passou a encolher e
   truncar, o valor virou `whitespace-nowrap`, e a caixa foi para 268 px.
3. **Bolha do usuário clara demais** — `#1c1c23` sobre o fundo novo lia como um
   painel, principalmente com imagem anexada. Baixada para `#17171d`.

### Fases 5 e 6 — o que mudou

- Tool card com **um** fundo (`--p-surface`) para os três estados; verde e
  vermelho ficaram só no ícone de status. Os tokens `--p-tool-pending`,
  `--p-tool-success` e `--p-tool-error` foram removidos do tema.
- Bloco de raciocínio sem itálico e com a barra lateral em `--p-elevated`.
- Tela inicial: borboleta, saudação por período do dia em `--font-display` com o
  primeiro nome deduzido do diretório home, subtítulo, e "Ver uso" como link
  discreto. O painel de estatísticas saiu para `UsagePanel.tsx` e abre em modal.
  A saudação fica ancorada logo acima do composer, não centralizada na tela:
  centralizada, abria um vão de ~300 px entre as duas coisas que formam um grupo.
- Nome do usuário: `firstNameFromHome` ignora contas genéricas (`root`, `ubuntu`,
  `admin`…) e cai para a saudação sem nome, em vez de chamar alguém de "Ubuntu".
- Chaves de i18n novas nos três idiomas (272 chaves em cada, paridade conferida).

**Quarto defeito, encontrado ao validar a fase 5:** em conversa carregada do
disco o tool card mostrava só o nome da ferramenta, sem o código executado. Os
argumentos vêm no bloco `toolCall` da mensagem do assistente, mas o redutor só
os copiava a partir do evento `tool_execution_start` — que não existe quando a
conversa vem do arquivo. `upsertMessage` (`src/renderer/src/store/transcript.ts`)
passou a semear `tools[id].args` a partir dos blocos da própria mensagem.

---

## 5. Fora do escopo visual, mas encontrado no caminho

### 5.1 O diretório de trabalho não acompanha a conversa

**Sintoma relatado:** abrir uma conversa nova apontando para a pasta de um
repositório e, ao voltar para a conversa anterior, os chips continuam mostrando
o repositório da outra conversa.

**Causa:** o `cwd` é global da ponte, não da sessão.

- `src/main/index.ts:239` — `workspaceRoot` é um único valor de processo.
- `src/main/index.ts:262` — com a ponte de pé, `bridge:start` **ignora** um `cwd`
  novo e devolve o atual.
- `src/renderer/src/store/agent.ts:368` (`switchAndLoad`) — troca a sessão e
  recarrega o histórico, mas **nunca** reconcilia o diretório.

**Agravante:** não é só cosmético. Depois da troca, o agente realmente continua
executando `bash` e `edit` na pasta da outra conversa.

**Corrigido.** `syncCwdToSession` roda antes do `switch_session`: compara o
`cwd` do cabeçalho da sessão (`SessionSummary.cwd`) com o da ponte e, se
diferirem, reinicia a ponte no diretório da conversa. Sessão sem `cwd` mantém o
diretório atual. Com execução em SSH o passo é pulado — o destino remoto é
montado com porta e chave que não estão no catálogo, e reiniciar às cegas
derrubaria a conexão.

Efeito colateral que apareceu no teste: `bridge:stop` emite um `agent:exit`
esperado, que põe o status em "parado". Sem marcar o reinício, a barra dizia
"Desconectado" com a ponte já de pé e o composer travava em "Conectando ao
agente…". `restartBridgeAt` agora move o status para "iniciando" antes e
"pronto" depois.

Verificado na janela: abrir a conversa de `gnexum-platform` troca os chips para
`gnexum-platform` + branch `feat/sentinel-instance-telemetry`, e voltar para uma
conversa da Home devolve `Home` sem branch.


---

## 6. Fase 7 e os pedidos que vieram junto

### Fase 7 — ícones e movimento

- **148 ícones** normalizados em 22 arquivos: dois tamanhos apenas, 14 px
  (denso: linhas de sessão, chips, tool cards) e 16 px (ações primárias), todos
  com `strokeWidth={1.75}`. Antes eram 17 valores diferentes entre 9 e 19.
  Exceções deliberadas: a borboleta da marca (13/19/34/46, é logotipo, não ícone)
  e três ícones na linha de metadados da árvore de agentes, mantidos em 12 px
  porque acompanham texto de 10,5 px.
- `prefers-reduced-motion` respeitado: quem pede menos movimento no sistema
  recebe animação e transição zeradas. Nada no app depende de animação para
  comunicar — o cursor de streaming e o giro de "executando" têm equivalente no
  texto de estado.

### Barra de ferramentas do topo

Quatro botões à direita da barra de título: terminal, alterações, arquivos e
agentes. Eles existiam espalhados — o terminal só aparecia no onboarding, a
árvore num canto da sidebar, os arquivos num chip do composer. Juntos viram um
lugar só de "abrir alguma coisa sobre o workspace". O contador de subagentes
virou um selo sobre o ícone da árvore. Atalhos: `Ctrl+Shift+F` arquivos,
`Ctrl+Shift+D` alterações, `Ctrl+B` agentes.

### Painel de alterações (novo)

`git status` + `git diff` do diretório onde o agente executa, em
`DiffPanel.tsx`, com `gitChanges`/`gitDiff` em `src/main/files.ts`.

- Lista por arquivo, com marca de estado (`M`, `A`, `D`, `R`, `N`) e contagem
  `+`/`−`; clicar expande o diff colorido.
- Arquivo não rastreado não tem diff contra HEAD: cai para
  `git diff --no-index /dev/null <arquivo>`, que mostra tudo como adição.
- `--untracked-files` fica no padrão (`normal`): com `all`, uma pasta de saída
  como `graphify-out/` despejava dezenas de linhas e enterrava o que importa.
- Mesma regra de caminho do explorador: nada fora da raiz, nem por symlink.
  Verificado — `../../../etc/passwd` é recusado.
- Somente leitura. Não há stage, commit ou descarte.

### Título da conversa

Passou a ser gerado **junto com o primeiro prompt**, em paralelo ao turno, em vez
de esperar o `agent_end`. Numa tarefa longa isso significava ver "Nova conversa"
na sidebar por minutos. O assunto já está na primeira mensagem; a resposta entra
no material quando existe, mas não é pré-requisito. A sondagem do cliente
efêmero também caiu de 600 ms para 120 ms — meio segundo de pedágio a cada
título, mesmo com o worker já de pé.

### Abrir conversa na última mensagem

A implementação anterior insistia por seis quadros de `requestAnimationFrame`
(~100 ms) e desistia. A altura só estabiliza depois: imagens anexadas carregam,
o destaque de sintaxe re-renderiza os blocos de código, as fontes embutidas
reflowam o texto. Agora um `ResizeObserver` sobre o conteúdo, mais os eventos
`load` das imagens, mantêm a rolagem colada no fim por até dois segundos.
Verificado na conversa mais pesada do disco (648 chamadas de ferramenta).

### Agentes trabalhando

O poller do main roda a cada 3 s, porque cada ciclo gasta um processo
`prime-agent list`. Durante o turno os subagentes nascem e morrem em segundos,
então o renderer passa a pedir atualização a cada 1,5 s **enquanto está
transmitindo**, e volta ao ritmo do main quando para.

### Trocar de conversa sem perder a execução — feito

O worker do daemon carrega uma sessão por vez, então trocar de conversa dentro da
mesma ponte matava o turno. Medido: **dois `prime-agent --mode rpc` coexistem**,
cada um com sua sessão. O limite era da GUI, que mantinha uma ponte só.

`src/main/index.ts` passou a ter uma ponte ativa mais um mapa de **estacionadas**
(teto de 3, cada uma é um processo e um worker). Os eventos saem carimbados com
`bridgeId` e o renderer descarta o que não vem da ativa — sem isso, um turno de
fundo escreveria na conversa aberta. `response`, `stderr`, `fatal` e `exit` só
são repassados quando a ponte é a ativa.

Fluxo de `openSession`, nesta ordem:

1. A conversa de destino está numa ponte estacionada → **readota** aquela ponte.
2. A atual está executando → **estaciona** (o turno segue) e sobe uma ponte nova
   para o destino.
3. Nada rodando → caminho antigo, a mesma ponte troca de sessão.

Se estacionar falhar, cai no comportamento anterior: confirmar e abortar. Melhor
perguntar do que perder um turno em silêncio.

Quando o turno de uma estacionada termina, ela é encerrada e o renderer recebe
`bridge:run-ended`. Manter o worker vivo depois do fim só prenderia a sessão
(`already active in <worker>`) sem oferecer nada — reabrir a conversa lê a
transcrição do disco, que a essa altura está completa.

**Armadilha encontrada no teste:** estacionar deixa o app sem ponte ativa, e
`switch_session` não tem para onde ir. A primeira versão trocava de conversa e
mostrava a tela inicial vazia, com a barra presa em "Running". A substituta passou
a subir dentro do próprio `parkCurrentRun`, antes de qualquer outra coisa.

Verificado na janela, com turno real de `time.sleep` no Haiku 4.5:

- trocar de conversa no meio do turno não abre diálogo, carrega a conversa de
  destino inteira e mostra o aviso "The run keeps going in the background";
- a linha da conversa que continua rodando ganha um ponto pulsando na sidebar;
- voltar nela reata ao vivo — o card de ferramenta ainda girando, o composer em
  modo *steer* e o botão de parar;
- ao terminar em segundo plano, o ponto some e o catálogo é recarregado. O aviso
  de conclusão some sozinho depois de alguns segundos; a captura foi tirada
  tarde demais para registrá-lo.

### Cor da janela

`backgroundColor` e `titleBarOverlay` em `src/main/index.ts` ainda usavam o preto
do tema antigo (`#050506`, `#a1a1aa`): o primeiro quadro da janela piscava mais
escuro que o app e os botões nativos ficavam sobre a cor errada. Alinhados a
`#0b0b0f` / `#a3a3ae`.
