<div align="center">

# Prime Desk

**Interface gráfica desktop para o [`prime-agent`](https://github.com/PrimeIntellect-ai/prime-agent)**

Acabamento no padrão Claude Desktop, identidade visual oficial do Prime.

</div>

---

## O que é

Um cliente desktop para o `prime-agent`. A GUI **não reimplementa o agente**:
ela conversa com o binário oficial pelo modo RPC e apenas renderiza. Contexto,
compactação, skills, subagentes e o kernel IPython continuam inteiramente no
`prime-agent`.

```
Renderer (React) ─ IPC ─ Electron Main ─ stdin/stdout JSONL ─ prime-agent --mode rpc
```

## Funcionalidades

| | |
|---|---|
| **Streaming** | texto, raciocínio e tool calls em tempo real |
| **Tool cards** | código executado, stdout/stderr, duração, status, aviso de restart de kernel |
| **Raciocínio** | blocos de thinking colapsáveis |
| **Markdown** | GFM completo, tabelas e syntax highlight na paleta oficial |
| **Modelos** | troca em tempo real, com custo por Mtok e indicador de reasoning |
| **Thinking** | sete níveis, de `off` a `max` |
| **Sessões** | sidebar com busca, lida direto de `~/.prime/agent/sessions` |
| **HUD** | tokens, ocupação da janela de contexto, custo acumulado, goal ativo |
| **Controle** | abort (`Esc`), steer durante streaming, compactação manual |
| **Paleta** | `Ctrl+K` com skills descobertas via `get_commands` |
| **Imagens** | anexo para modelos multimodais |
| **Árvore de agentes** | hierarquia RLM pai→filho em tempo real, com status, profundidade e o código que originou cada subagente (`Ctrl+B`) |
| **Pastas** | conversas organizadas em pastas manuais e em grupos automáticos por projeto |
| **Ações da conversa** | menu `⋯` com abrir, fixar, renomear, duplicar, mover, arquivar e excluir |
| **Explorador** | árvore de arquivos do diretório de trabalho, com filtro (`Ctrl+Shift+F`) |
| **Editor** | abre arquivos com syntax highlight, edita e salva (`Ctrl+S`) |
| **Barra de contexto** | chips com Local, diretório, branch do git e atalho para os arquivos |
| **Painéis redimensionáveis** | arraste os divisores; duplo clique restaura |
| **Dock à direita** | arquivos e agentes se alternam, para o chat nunca ficar espremido |

## Organização de conversas

A sidebar agrupa em dois níveis:

- **Grupos automáticos** — derivados do diretório de trabalho da sessão, o que na
  prática equivale ao projeto. Zero configuração.
- **Pastas manuais** — criadas com o botão de pasta, renomeáveis, com `+` para já
  criar a conversa dentro dela. O menu `⋯` de cada conversa move entre pastas.

A atribuição manual tem precedência sobre o agrupamento automático. Tudo isso vive
em `<userData>/folders.json` e guarda **apenas** ids de sessão e nomes de pasta —
nenhum conteúdo de conversa é duplicado.

## Árvore de subagentes

`Ctrl+B` abre o painel de agentes: a hierarquia completa de descendentes RLM, com
status (ativo / aguarda / respondeu), profundidade, contagem de mensagens, modelo
e o `spawnCode` — o código Python exato que criou cada subagente.

Os dados vêm de `prime-agent list --json`, a única superfície que expõe
`parentActiveSessionId`. O poller roda a cada 3 s e **pausa** quando a janela não
está visível.

### Acompanhar um subagente ao vivo

O ícone de olho em qualquer nó da árvore abre o **transcript ao vivo** daquela
sessão: raciocínio, texto e execução de ferramentas em tempo real, com o mesmo
tratamento visual da conversa principal.

Usa `observe` / `unobserve` do RPC. O agente bufferiza os eventos até entregar o
histórico, então não existe janela de perda entre o que já aconteceu e o que
chega depois.

O painel é **somente leitura** — por decisão de projeto. Injetar prompt ali
exigiria `send_message` e transformaria "observar" em "interferir", o que merece
uma interação explícita e não um efeito colateral de abrir um painel.

## Empacotamento

| Alvo | Comando | Onde compila |
|---|---|---|
| `.deb` + AppImage | `npm run dist:linux` | qualquer host Linux |
| macOS `.zip` (x64 + arm64) | `npm run dist:mac` | **qualquer host**, inclusive Linux |
| macOS `.dmg` | `npm run dist:mac:dmg` | **só em macOS** |

O `.dmg` não compila fora do macOS: o `dmg-license` é dependência darwin-only e o
empacotamento usa `hdiutil`. Para gerar dmg assinado e notarizado use o workflow
`.github/workflows/release.yml`, que roda num runner `macos-14`.

> Builds macOS sem certificado Apple saem **não assinados**. O Gatekeeper vai
> bloquear na primeira execução; o usuário precisa liberar manualmente em
> Ajustes → Privacidade e Segurança. Para distribuir de verdade, preencha os
> segredos de assinatura no CI.

### Ícone na barra de tarefas

A janela recebe o ícone via `setIcon`, mas no Linux **a barra de tarefas não usa
o ícone da janela** — ela casa o `WM_CLASS` com um `.desktop` instalado. Rodando
em desenvolvimento (`npm run dev`) não existe `.desktop`, então o shell mostra um
ícone genérico. Instalando o `.deb`, que traz `prime-desk.desktop` com
`StartupWMClass=prime-desk` e os ícones em `hicolor`, a borboleta aparece.

Ícones: `npm run icon` rasteriza `resources/brand/prime-butterfly.svg` em todos os
tamanhos usando o próprio Electron — sem depender de Inkscape ou ImageMagick.

## Requisitos

- Node.js 20+ (validado em v22.22.2)
- `prime-agent` instalado, no `PATH` e **autenticado** (rode `prime-agent` uma vez no terminal)
- Linux (validado em Ubuntu 24.04). macOS e Windows devem funcionar, sem teste.

## Instalação

```bash
npm install
```

### Sandbox do Chromium no Linux

O Ubuntu 24.04 restringe user namespaces sem privilégio
(`kernel.apparmor_restrict_unprivileged_userns=1`), então o Chromium exige o
helper setuid com owner `root`. Faça isso **uma vez**:

```bash
npm run fix-sandbox    # sudo chown root:root + chmod 4755 no chrome-sandbox
```

Se você não tem `sudo`, existe um escape **apenas para desenvolvimento**:

```bash
npm run dev:nosandbox
```

Ele desliga o sandbox do Chromium — é opt-in explícito, nunca aplicado em
silêncio. Não use assim em uso rotineiro.

## Uso

```bash
npm run dev      # desenvolvimento com HMR
npm run build    # compila para out/
npm start        # roda o build
npm run typecheck
```

## Explorador e editor de arquivos

A barra acima do composer mostra onde o agente está executando: **Local**, o
**diretório de trabalho** (clique para trocar), a **branch** do git e o botão de
arquivos.

O painel de arquivos (`Ctrl+Shift+F`) lista a árvore do diretório de trabalho.
Clicar num arquivo abre o editor embutido — syntax highlight para ~30 linguagens,
edição e gravação com `Ctrl+S`. O `@` ao lado de cada arquivo cita o caminho no
prompt em vez de abrir.

**Limites deliberados:**

- Tudo é resolvido contra a raiz do workspace. `..`, caminho absoluto e symlink
  que aponte para fora são recusados — é um explorador do projeto, não um leitor
  de disco.
- Arquivos acima de 1 MB são exibidos truncados e com edição desabilitada, para
  não gravar um arquivo cortado por cima do original.
- Binários não são renderizados; abrem no aplicativo padrão do sistema.
- O editor não tem histórico de desfazer entre sessões. Versione antes de mexer
  em arquivo importante.

## Ações da conversa

O menu `⋯` de cada conversa: **Abrir**, **Fixar no topo**, **Renomear**,
**Duplicar** (só na conversa aberta — usa `clone` do RPC, que age sobre a sessão
ativa), **Mover para pasta**, **Arquivar** e **Excluir**.

Fixar, arquivar e renomear são estado **da GUI** (`folders.json`): não alteram a
sessão do agente. Excluir é real e apaga o `.jsonl` do disco, com confirmação e
bloqueado para a conversa aberta.

## Atalhos

| Tecla | Ação |
|---|---|
| `Enter` | enviar |
| `Shift+Enter` | nova linha |
| `Ctrl+K` | paleta de comandos |
| `Ctrl+B` | árvore de agentes |
| `Ctrl+Shift+F` | explorador de arquivos |
| `Ctrl+S` | salvar arquivo no editor |
| `Esc` | interromper o turno |

## Arquitetura

```
src/
├─ shared/protocol.ts      tipos do protocolo RPC (fonte única)
├─ main/
│  ├─ index.ts             janela, IPC, ciclo de vida
│  ├─ rpc-client.ts        spawn + framing JSONL + correlação de requisições
│  ├─ session-catalog.ts   leitura das sessões em disco
│  ├─ agent-tree.ts        árvore RLM via `prime-agent list --json`
│  ├─ files.ts             explorador/leitura/escrita com escopo na raiz
│  └─ folders.ts           persistência das pastas
├─ preload/index.ts        contextBridge (superfície mínima)
└─ renderer/src/
   ├─ store/transcript.ts  reducer puro (própria sessão e observadas)
   ├─ store/agent.ts       estado de UI, comandos RPC, observações
   ├─ styles/theme.css     paleta oficial como CSS custom properties
   └─ components/          Sidebar, StatusBar, Composer, Message, ToolCard, …
```

### Três decisões que importam

**1. RPC, não ACP.** ACP é padrão aberto mas expõe só cinco métodos e não permite
trocar modelo, ajustar thinking nem compactar. Todo o acoplamento está em
`rpc-client.ts`; migrar para ACP é mexer em um arquivo.

**2. Snapshot, não delta.** O evento `message_update` carrega o conteúdo
**completo** da mensagem além do delta. O renderer usa o snapshot e ignora os
deltas — renderização idempotente, sem bugs de remontagem.

**3. Parser LF próprio.** O protocolo usa `\n` como único delimitador. O
`readline` do Node **não** é compatível: ele também quebra em `U+2028`/`U+2029`,
que são válidos dentro de strings JSON.

Mapeamento técnico completo: [`docs/MAPEAMENTO.md`](docs/MAPEAMENTO.md).
Plano e fases: [`docs/PLANO.md`](docs/PLANO.md).

## Segurança

- `contextIsolation: true`, `nodeIntegration: false`
- A GUI **não lê nem replica** `~/.prime/agent/auth.json`. Credenciais ficam sob
  responsabilidade exclusiva do `prime-agent`.
- Navegação interna bloqueada; links abrem no navegador do sistema.
- CSP restritiva no documento do renderer.
- Sem telemetria própria.

> **Antes de distribuir internamente:** o histórico de conversas fica em disco e
> pode conter dados de cliente. Defina retenção e criptografia em repouso, e
> valide com a área de Segurança da Informação frente a LGPD / ISO 27001.

## Licença

MIT
