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
- [ ] Árvore de subagentes RLM (lê `_meta`/eventos de child)
- [ ] Modo bash dedicado
- [ ] Export HTML

### Fase 4 — Acabamento
- [ ] Empacotamento AppImage/deb (`electron-builder`)
- [ ] Atalhos globais e tray
- [ ] Persistência de preferências

## Decisões registradas

| # | Decisão | Razão |
|---|---|---|
| 1 | Electron, não Tauri | Sem Rust no ambiente; `spawn` nativo é mais simples que sidecar |
| 2 | RPC, não ACP | ACP não expõe modelo/thinking/compactação; RPC sim |
| 3 | Snapshot em vez de delta | `message_update` já traz o conteúdo completo → render idempotente |
| 4 | Parser LF próprio | `readline` do Node é incompatível com o framing (quebra em U+2028/9) |
| 5 | Sidebar lê JSONL direto | Listar sessões sem custo de subir worker |
| 6 | Tema como CSS vars | Espelha `prime.json`; permite hot-swap e temas custom depois |

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
