# Prime Desk — Plano de implementação

Interface gráfica desktop para o `prime-agent`, no padrão de acabamento do
Claude Desktop, com a identidade visual oficial do Prime (tema `prime`, borboleta).

## Princípio arquitetural

> A GUI é um **cliente fino**. Ela não reimplementa contexto, compactação,
> skills, subagentes ou orquestração. Tudo isso continua no `prime-agent`.

Motivo: qualquer lógica de agente duplicada na GUI divergiria a cada
`prime-agent update`. O acoplamento fica num único arquivo (`rpc-client.ts`).

```
┌──────────────────────────────────────────┐
│ Renderer (React + Tailwind)              │  ← só renderiza
│  zustand store  ◄── eventos              │
└────────────┬─────────────────────────────┘
             │ contextBridge (preload, sandbox)
┌────────────▼─────────────────────────────┐
│ Electron Main                            │
│  RpcClient ─ spawn ─ JSONL(LF)           │
│  SessionCatalog (lê ~/.prime/agent)      │
└────────────┬─────────────────────────────┘
             │ stdin/stdout
┌────────────▼─────────────────────────────┐
│ prime-agent --mode rpc                   │
│  daemon → supervisor → worker → IPython  │
└──────────────────────────────────────────┘
```

## Fases

### Fase 1 — Fundação (núcleo funcional)
- [x] Mapeamento do protocolo + validação por smoke test
- [x] Scaffold electron-vite + React + TS + Tailwind
- [x] `RpcClient`: spawn, framing LF, correlação `id`→resposta, fila, kill
- [x] Ponte IPC segura (`contextIsolation`, sem `nodeIntegration`)
- [x] Store zustand reduzindo os eventos para estado de UI

### Fase 2 — Interface
- [x] Tema `prime` como CSS custom properties (fonte única de verdade)
- [x] Logo borboleta em SVG vetorial
- [x] Sidebar de sessões (leitura direta do JSONL)
- [x] Timeline: markdown, code highlight, blocos de thinking colapsáveis
- [x] Cards de tool call com stdout/stderr, duração e status
- [x] Composer com auto-resize, Enter/Shift+Enter, anexo de imagem
- [x] HUD: modelo, thinking, tokens, custo acumulado, estado de stream

### Fase 3 — Funcionalidades do agente
- [x] Troca de modelo (`get_available_models` / `set_model`)
- [x] Nível de thinking (off→max)
- [x] Abort de turno
- [x] Steer / follow-up durante streaming
- [x] Compactação manual + indicador
- [x] Paleta de comandos (⌘K) alimentada por `get_commands`
- [x] Árvore de subagentes RLM (via `prime-agent list --json`)
- [x] Organização de conversas em pastas + grupos automáticos por projeto
- [x] Transcript ao vivo de um subagente (`observe`/`unobserve`)
- [x] Explorador de arquivos com escopo na raiz do workspace
- [x] Editor embutido com highlight, edição e gravação
- [x] Menu de ações da conversa (fixar, renomear, arquivar, excluir)
- [x] Painéis redimensionáveis com largura persistida
- [ ] Modo bash dedicado
- [ ] Export HTML

### Fase 4 — Acabamento
- [x] Ícone do app rasterizado do SVG da marca (`scripts/make-icon.mjs`)
- [x] Empacotamento Linux: `.deb` + AppImage
- [x] Empacotamento macOS: `.zip` x64/arm64 (dmg exige host macOS)
- [x] CI de release (`.github/workflows/release.yml`)
- [ ] Assinatura e notarização Apple (precisa de certificado)
- [ ] Atalhos globais e tray
- [ ] Auto-update

## Decisões registradas

| # | Decisão | Razão |
|---|---|---|
| 1 | Electron, não Tauri | Sem Rust no ambiente; `spawn` nativo é mais simples que sidecar |
| 2 | RPC, não ACP | ACP não expõe modelo/thinking/compactação; RPC sim |
| 3 | Snapshot em vez de delta | `message_update` já traz o conteúdo completo → render idempotente |
| 4 | Parser LF próprio | `readline` do Node é incompatível com o framing (quebra em U+2028/9) |
| 5 | Sidebar lê JSONL direto | Listar sessões sem custo de subir worker |
| 6 | Tema como CSS vars | Espelha `prime.json`; permite hot-swap e temas custom depois |
| 7 | Árvore via CLI, não RPC | `parentActiveSessionId` só existe em `list --json`; o RPC não expõe o vínculo |
| 8 | Pastas só na GUI | O agente não tem conceito de pasta; metadado de apresentação não deve vazar para ele |
| 9 | Poller pausado com janela oculta | `list --json` é processo separado; não deve girar à toa |
| 10 | Ícone rasterizado pelo Electron | Evita depender de Inkscape/librsvg/ImageMagick na máquina de build |
| 11 | Reducer puro compartilhado | Eventos observados têm o mesmo formato dos próprios; um reducer serve aos dois |
| 12 | Hidratar `toolResult` do histórico | Histórico não reemite `tool_execution_*`; sem isso os cards ficam presos em "preparando" |
| 13 | Painel observado é somente leitura | Injetar prompt exigiria `send_message` e mudaria "observar" para "interferir" |
| 14 | Explorador com escopo na raiz | Recusa `..`, absoluto e symlink externo: é explorador de projeto, não leitor de disco |
| 15 | Dock direito exclusivo | Dois painéis simultâneos reduziam o chat a ~280px e inutilizavam o composer |
| 16 | Pasta só nasce com nome | Criar direto acumulava "Nova pasta" vazia sem propósito |
| 17 | Estatísticas com cache por mtime | Sessões chegam a vários MB; revarrer tudo a cada abertura é desperdício |
| 18 | Título via RPC efêmero, não `-p` | O modo print não retorna quando lançado do main do Electron |
| 19 | Título gravado com `set_session_name` | Vive na sessão do agente e aparece no TUI, em vez de virar rótulo só da GUI |
| 20 | Cores do tema com canais RGB | Sem isso o modificador de opacidade do Tailwind é descartado em silêncio |

## Segurança

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox` no preload.
- A GUI **não** lê nem replica `~/.prime/agent/auth.json`. Credenciais
  permanecem sob responsabilidade exclusiva do `prime-agent`.
- Sem telemetria própria.
- Navegação externa bloqueada; links abrem no navegador do sistema.

### Pendências antes de qualquer distribuição interna
Histórico de conversa em disco pode conter dados de cliente. Definir retenção,
criptografia em repouso e, se virar ferramenta corporativa, integrar SSO
(Authentik) e segredos (Vaultwarden) — e validar com Segurança da Informação
frente a LGPD / ISO 27001.
