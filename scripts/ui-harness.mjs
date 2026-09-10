/**
 * Servidor de verificação visual do renderer.
 *
 * O renderer é uma página React comum; o que o prende ao Electron é o
 * `window.prime` do preload. Este script serve o build de `out/renderer` com um
 * `window.prime` falso injetado antes do bundle, para que a interface possa ser
 * aberta num navegador qualquer.
 *
 * Serve para conferir layout, montagem e estados de tela sem subir o Electron —
 * útil em ambiente sem GPU ou sem memória compartilhada, onde o Chromium do
 * Electron não inicializa o processo de renderização.
 *
 * NÃO substitui testar no app: nada aqui exercita IPC, PTY ou o agente de
 * verdade. É andaime de inspeção, não teste de integração.
 *
 *   node scripts/ui-harness.mjs [porta]
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'out', 'renderer')
const PORT = Number(process.argv[2] ?? 5199)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

/**
 * Sessões e estado de mentira, o bastante para a tela montar.
 *
 * Vai como ARQUIVO, não inline: o `index.html` do app declara
 * `script-src 'self'`, e um `<script>` embutido é bloqueado pela política — que
 * é o comportamento correto dela. Script clássico no `<head>` roda antes do
 * bundle, que é módulo e portanto adiado.
 */
const STUB_JS = `
(() => {
  const listeners = {}
  let currentBranch = 'fix/connection-health-retention'
  let jobs = [
    { id: 'j1', status: 'active', activeSessionId: 'a', sessionId: 's', sessionFile: '/tmp/s.jsonl',
      cwd: '/home/dev/projeto', prompt: 'Revisar os PRs abertos e resumir o que falta em cada um.',
      schedule: { kind: 'cron', expression: '0 9 * * 1-5' },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + 3600e3).toISOString(),
      lastRunAt: new Date(Date.now() - 86400e3).toISOString(), runCount: 12 },
    { id: 'j2', status: 'active', activeSessionId: 'a', sessionId: 's', sessionFile: '/tmp/s.jsonl',
      cwd: '/home/dev/projeto', prompt: 'Rodar a suite de testes e me avisar se algo quebrou.',
      schedule: { kind: 'interval', expression: 'every 30m', intervalMs: 1800000 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + 900e3).toISOString(), runCount: 3,
      lastError: 'npm error code ELIFECYCLE' }
  ]
  let folderState = { folders: [], assignments: {}, collapsed: {}, titles: {} }
  let heartbeat = null
  const kid = (name, status, usage) => ({ activeSessionId: name, sessionId: name, sessionFile: '', name,
    kind: 'subagent', depth: 1, status, taskState: '', replied: status !== 'working',
    hasRunningChildren: false, messageCount: 4, firstMessage: '', cwd: '/home/dev/projeto',
    modelName: 'claude-fable-5', lastActivityAt: new Date().toISOString(), usage,
    // Origem 'disk': e o caso comum (conversa fora do daemon). O botao de
    // acompanhar nao deve aparecer nesses nos.
    source: 'disk', children: [] })
  const fakeTree = { total: 4, subagents: 3, at: Date.now(), roots: [{
    activeSessionId: 'root', sessionId: 'root', sessionFile: '', name: '', kind: 'root', depth: 0,
    status: 'working', taskState: '', replied: false, hasRunningChildren: true, messageCount: 20,
    firstMessage: '', cwd: '/home/dev/projeto', modelName: 'claude-opus-5',
    lastActivityAt: new Date().toISOString(),
    source: 'disk',
    /*
      Custos diferentes de proposito, e o 'typeorm' sem usage nenhum: e o caso
      real do incidente do Gnexum, onde tres subagentes rodaram e nao dava pra
      ver quanto cada um tinha gastado. O sem-usage confere que o card daquele
      no fica mudo, sem mostrar $0.00 como se fosse dado de verdade.
    */
    children: [
      kid('typeorm', 'working', undefined),
      kid('docker', 'working', { inputTokens: 8400, outputTokens: 2100, cost: 0.1234 }),
      kid('migrations', 'idle', { inputTokens: 15200, outputTokens: 3800, cost: 0.2156 })
    ]
  }] }
  const state = {
    model: { id: 'claude-fable-5', name: 'Claude Fable 5', api: 'anthropic', provider: 'anthropic', contextWindow: 1000000 },
    /*
      Turno em curso ligavel por querystring: ?streaming=1. Serve para conferir
      o que a tela faz durante um turno — o aviso de turno silencioso, o relogio
      dos cards, o seletor de entrega do composer — sem precisar de agente real.
    */
    thinkingLevel: 'medium',
    isStreaming: new URLSearchParams(location.search).has('streaming'),
    isCompacting: false,
    steeringMode: 'one-at-a-time', followUpMode: 'one-at-a-time',
    /*
      Casa com o id da primeira sessao da lista. Antes era 'stub-session', que
      nao existia em sessao nenhuma, entao nenhuma linha da sidebar ficava ativa
      e o estado de selecao — o mais importante de uma lista — nao dava para
      conferir aqui.
    */
    sessionId: 's1', autoCompactionEnabled: true, messageCount: 2,
    sessionActions: {
      queuedCount: 2,
      steering: [
        'Confere o teste que quebrou no CI',
        // Relatório de subagente: rótulo do agente + caminho longo sem espaço.
        // Os dois casos que a fila precisa saber desenhar.
        'Agent message received from child docker: RELATÓRIO 02 — transaction mode: /home/dev/projeto/analise_migrations/02_transaction_mode.md'
      ],
      followUps: ['Depois disso, atualiza o README'],
      active: { kind: 'turn', phase: 'running' }
    },
    goal: { active: false, status: 'idle', tokensUsed: 0, timeUsedSeconds: 0, continuationsUsed: 0 }
  }
  /*
    Duas pastas de projeto, uma delas grande de proposito: e o cenario real de
    quem trabalha em mais de um repositorio, e o unico jeito de conferir o
    "mostrar mais" e o recorte por grupo.
  */
  const sessions = (() => {
    const iso = (min) => new Date(Date.now() - min * 60000).toISOString()
    const fazer = (id, cwd, title, min, named = false) => ({
      id, path: '/tmp/' + id + '.jsonl', cwd,
      createdAt: iso(min + 60), updatedAt: iso(min),
      // O campo named diz se o nome esta gravado no arquivo. Sem ele, o app
      // nao distingue nome de verdade do texto do primeiro prompt.
      title, named, messageCount: 12 + (min % 30), sizeBytes: 4096
    })
    const gnexum = '/home/dev/gnexum-platform'
    const mono = '/home/dev/inteligente-monorepo'
    return [
      fazer('s1', gnexum, 'Analise esses arquivos e veja a estrutura do projeto', 2),
      fazer('s2', gnexum, 'API Gnexum indisponivel sem logs', 14),
      fazer('s3', gnexum, 'Rotas MCP para Gnexum Vila Porto', 40, true),
      fazer('s4', gnexum, 'Partner API v1 review', 70),
      fazer('s5', gnexum, 'Chat GraphQL integration', 95, true),
      fazer('s6', gnexum, 'Relatorio e teste de velocidade da rede', 130),
      fazer('s7', gnexum, 'Erro ao buscar contagem de usuarios', 170),
      fazer('s8', gnexum, 'Analise de integracao com Teams', 210),
      fazer('s9', gnexum, 'Keycloak vulnerabilidade autenticacao', 260),
      fazer('s10', gnexum, 'SQL visibility em rotas com MCP', 300),
      fazer('s11', gnexum, 'Observabilidade panorama analise', 350),
      fazer('s12', gnexum, 'Backend Docker logs review', 400),
      fazer('s13', gnexum, 'Validacao de endpoints da API', 460),
      fazer('s14', gnexum, 'Instancias de acesso a maquina', 520),
      fazer('s15', gnexum, 'Automacao de senha Oracle no GeneXon', 590),
      fazer('s16', mono, 'Migracao Home para site', 25, true),
      fazer('s17', mono, 'Analise de lawtechs e escritorios', 80),
      fazer('s18', mono, 'Variaveis de ambiente PRD', 150),
      fazer('s19', mono, 'Aja como um Arquiteto de IA Senior especialista em RAG', 240)
    ]
  })()
  /*
    Conversa de mentira, longa o bastante para o botão de "carregar antigas"
    aparecer (a janela é de 60) e com bloco de código, que é o que faz a altura
    mudar depois da primeira pintura — o caso que a rolagem aderente trata.

    Sem template literal e sem interpolação: este trecho mora dentro do
    template literal do STUB_JS, e backtick ou \${} aqui fechariam ele.
  */
  const fakeMessages = (() => {
    const out = []
    const fence = String.fromCharCode(96, 96, 96)
    for (let i = 1; i <= 34; i++) {
      const at = Date.now() - (70 - i) * 60000
      out.push({
        role: 'user',
        content: [{ type: 'text', text: 'Pergunta ' + i + ': por que o build quebrou?' }],
        timestamp: at
      })
      out.push({
        role: 'assistant',
        model: 'claude-fable-5',
        content: [{ type: 'text', text:
          'Resposta ' + i + '. O erro vem do passo de empacotamento:\\n\\n' +
          fence + 'bash\\nnpm run build -- --mode=production\\n' + fence +
          '\\n\\nRodei e confirmei.' }],
        timestamp: at + 30000
      })
    }
    return out
  })()

  const rpc = {
    get_state: state,
    get_available_models: { models: [state.model] },
    get_commands: { commands: [{ name: 'websearch', description: 'Busca na web', source: 'skill' }] },
    get_session_stats: {
      sessionId: 'stub-session', userMessages: 2, assistantMessages: 2, toolCalls: 1,
      toolResults: 1, totalMessages: 4,
      tokens: { input: 30, output: 8219, cacheRead: 140436, cacheWrite: 21713, total: 170398 },
      cost: 0.3046,
      contextUsage: { tokens: 170398, contextWindow: 1000000, percent: 17 }
    },
    get_messages: { messages: fakeMessages }
  }
  window.prime = {
    appInfo: async () => ({ version: '0.2.0', home: '/home/dev', platform: 'linux', userName: 'Matheus Carvalho' }),
    checkEnvironment: async () => ({ ok: true, status: {
      agent: { installed: true, path: '/usr/bin/prime-agent', version: '0.8.0' },
      auth: { ok: true, providers: ['anthropic'], envKeys: [] }
    }}),
    startBridge: async () => ({ ok: true, cwd: '/home/dev/projeto', bridgeId: 'b1', execution: { kind: 'local' } }),
    stopBridge: async () => ({ ok: true }),
    send: async (type, payload) => {
      if (type === 'list_schedules') return { ok: true, res: { type: 'response', command: type, success: true, data: { jobs } } }
      if (type === 'get_heartbeat') return { ok: true, res: { type: 'response', command: type, success: true, data: { heartbeat } } }
      if (type === 'add_schedule') {
        const job = { id: 'j' + (jobs.length + 1), status: 'active', activeSessionId: 'a', sessionId: 's',
          sessionFile: '/tmp/s.jsonl', cwd: '/home/dev/projeto', prompt: payload.prompt,
          schedule: { kind: 'interval', expression: payload.schedule },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + 300e3).toISOString(), runCount: 0 }
        jobs = [...jobs, job]
        return { ok: true, res: { type: 'response', command: type, success: true, data: { job } } }
      }
      if (type === 'cancel_schedule') {
        jobs = jobs.filter((j) => j.id !== payload.jobId)
        return { ok: true, res: { type: 'response', command: type, success: true, data: {} } }
      }
      if (type === 'set_heartbeat') {
        heartbeat = { id: 'hb', status: 'active', source: 'heartbeat', deliveryMode: payload.deliveryMode,
          activeSessionId: 'a', sessionId: 's', sessionFile: '/tmp/s.jsonl', cwd: '/home/dev/projeto',
          prompt: payload.prompt, schedule: { kind: 'interval', expression: payload.schedule },
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          nextRunAt: new Date(Date.now() + 300e3).toISOString(), runCount: 0 }
        return { ok: true, res: { type: 'response', command: type, success: true, data: { heartbeat } } }
      }
      if (type === 'update_heartbeat') {
        if (payload.action === 'clear') heartbeat = null
        else if (heartbeat) heartbeat = { ...heartbeat, status: payload.action === 'pause' ? 'paused' : 'active' }
        return { ok: true, res: { type: 'response', command: type, success: true, data: { heartbeat } } }
      }
      return { ok: true, res: { type: 'response', command: type, success: true, data: rpc[type] ?? {} } }
    },
    fire: async () => ({ ok: true }),
    listSessions: async () => ({ ok: true, sessions }),
    // Persiste em memoria: sem isso o titulo gravado nao voltava na leitura
    // seguinte, e o lote parecia nao ter efeito nenhum.
    loadFolders: async () => ({ ok: true, state: folderState }),
    saveFolders: async (s) => {
      folderState = s
      return { ok: true, state: folderState }
    },
    usageStats: async () => ({ ok: true, stats: { sessions: 2, messages: 42, tokens: 170398, input: 30, output: 8219, cacheRead: 140436, cacheWrite: 21713, cost: 0.3, activeDays: 3, currentStreak: 2, longestStreak: 5, favoriteModel: 'claude-fable-5', peakHour: 15, days: [] } }),
    agentTree: async () => ({ ok: true, tree: fakeTree }),
    setAgentCadence: async () => ({ ok: true }),
    refreshAgentTree: async () => {
      setTimeout(() => window.__harness.emit('agents:tree', fakeTree), 60)
      return { ok: true }
    },
    filesRoot: async () => ({ ok: true, root: '/home/dev/projeto' }),
    listFiles: async () => ({ ok: true, entries: [
      { name: 'src', path: 'src', isDir: true, size: 0 },
      { name: 'package.json', path: 'package.json', isDir: false, size: 2148 }
    ] }),
    gitBranch: async () => ({ ok: true, branch: 'main' }),
    gitBranches: async () => ({ ok: true, dirty: true, branches: [
      'fix/connection-health-retention', 'main', 'feat/redesign-claude-desktop', 'fix/security-hardening'
    ].map((name) => ({ name, current: name === currentBranch })) }),
    gitCheckout: async (b) => {
      // A branch main recusa de proposito, para exercitar a mensagem real do git.
      if (b === 'main') {
        return { ok: false, error: 'error: Your local changes to the following files would be overwritten by checkout:\\n\\tsrc/App.tsx\\nPlease commit your changes or stash them before you switch branches.\\nAborting' }
      }
      currentBranch = b
      return { ok: true }
    },
    gitDiff: async () => ({ ok: true, diff: '@@ -1 +1 @@\\n-antes\\n+depois', truncated: false }),
    readFile: async () => ({ ok: true, content: '// exemplo', size: 12, binary: false }),
    writeFile: async () => ({ ok: true }),
    // A chave e 'entries', nao 'messages': e a que o loadTranscript le. Com o
    // nome errado ele estourava em entries.filter e a conversa abria vazia.
    transcript: async () => ({
      ok: true,
      entries: fakeMessages.map((message) => ({ type: 'message', message }))
    }),
    listParked: async () => ({ ok: true, parked: [] }),
    listSshConnections: async () => ({ ok: true, connections: [] }),
    saveSshConnections: async (list) => ({ ok: true, connections: list }),
    testSsh: async () => ({ ok: true }),

    /*
      Faltavam vinte metodos aqui. O pior era markBridge: switchAndLoad chama
      ele antes de carregar o transcript, entao abrir qualquer conversa
      estourava e a tela ficava na saudacao — o andaime so sabia mostrar o
      estado vazio, que e justamente o menos interessante de conferir.
    */
    /*
      Registra as chamadas: e por aqui que o processo principal descobre o id da
      sessao, e sem ele a arvore de agentes fica vazia. Ver o teste de fumaca
      logo abaixo do stub (window.__harness.marcados).
    */
    markBridge: async (args) => {
      window.__harness.marcados.push(args)
      return { ok: true }
    },
    parkBridge: async () => ({ ok: false }),
    adoptBridge: async () => ({ ok: false }),
    stopAgent: async () => ({ ok: true }),
    deleteSession: async () => ({ ok: true }),
    gitChanges: async () => ({ ok: true, files: [], branch: currentBranch }),
    pickDirectory: async () => ({ ok: false }),
    pickAttachment: async () => ({ ok: false }),
    pathForFile: () => '',
    revealFile: async () => ({ ok: true }),
    openExternal: async () => ({ ok: true }),
    /*
      Copiar de mentira, com falha ligavel por querystring (?copyfail=1). A
      falha e metade do bug original: o botao copiava nada e nao dizia nada.
    */
    copyText: async (text) => {
      if (new URLSearchParams(location.search).has('copyfail')) {
        return { ok: false, error: 'area de transferencia indisponivel' }
      }
      window.__copiado = text
      return { ok: true }
    },
    installCommand: async () => ({ ok: true, command: 'echo stub' }),
    installAgent: async () => ({ ok: true }),
    logoutProvider: async () => ({ ok: true }),
    checkLoginPort: async () => ({ ok: true, free: true }),
    speechStart: async () => ({ ok: false, error: 'motor de transcricao indisponivel no andaime' }),
    speechStop: async () => ({ ok: true }),
    speechTranscribe: async () => ({ ok: true, text: '' }),
    setZoom: async () => ({ ok: true, level: 0 }),
    watchEnvironment: async () => ({ ok: true }),
    unwatchEnvironment: async () => ({ ok: true }),
    createTerminal: async () => ({ ok: true }),
    writeTerminal: async () => ({ ok: true }),
    resizeTerminal: async () => ({ ok: true }),
    terminalScrollback: async () => ({ ok: true, scrollback: 'prime-desk $ ' }),
    killTerminal: async () => ({ ok: true }),
    pickWorkspaceFile: async () => ({ ok: false }),
    openAgentTerminal: async () => ({ ok: true }),
    /*
      Devolve um nome curto de mentira, com atraso: o real sobe um prime-agent
      efemero e leva segundos, e sem atraso aqui o progresso do lote passaria
      voando e nao daria para conferir.
    */
    generateTitle: async (convo) => {
      await new Promise((r) => setTimeout(r, 700))
      // O prefixo tem acento (usuario:), e o corte por 4 palavras pegava o
      // rotulo junto. Tira o prefixo por indice, nao por regex com acento.
      const texto = String(convo).split(':').slice(1).join(':').trim()
      const palavras = texto.split(/\s+/).filter(Boolean).slice(1, 5)
      return { ok: true, title: palavras.join(' ') || null }
    },
    speechStatus: async () => ({ ok: true, status: {
      ready: false, dir: '/home/dev/.config/prime-desk/speech', server: null,
      models: [
        { id: 'tiny', label: 'Tiny', bytes: 77691713, present: false },
        { id: 'base', label: 'Base', bytes: 147951465, present: false },
        { id: 'small', label: 'Small', bytes: 487601967, present: false }
      ],
      missing: []
    } }),
    speechSetupCommand: async () => ({ ok: true, command: 'echo compilando whisper.cpp' }),
    checkAgentUpdate: async () => ({ ok: true, update: { current: '0.8.0', latest: 'v0.9.1', available: true } }),
    rescanAgent: async () => ({ ok: true, status: {
      agent: { installed: true, path: '/usr/bin/prime-agent', version: '0.9.1' },
      auth: { ok: true, providers: ['anthropic'], envKeys: [] }
    } }),
    on: (ch, cb) => { (listeners[ch] ??= []).push(cb); return () => {} }
  }
  window.__harness = {
    emit: (ch, p) => (listeners[ch] ?? []).forEach((f) => f(p)),
    marcados: []
  }
  window.__errors = []
  addEventListener('error', (e) => window.__errors.push(String(e.message)))
  addEventListener('unhandledrejection', (e) => window.__errors.push('rejeição: ' + e.reason))
})()
`

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/__stub.js') {
    res.writeHead(200, { 'content-type': TYPES['.js'] })
    res.end(STUB_JS)
    return
  }
  const file = path === '/' ? '/index.html' : path
  try {
    let body = await readFile(join(ROOT, file))
    if (file === '/index.html') {
      // O stub precisa existir ANTES do bundle: o App usa window.prime já no boot.
      body = Buffer.from(
        String(body).replace('</head>', '<script src="/__stub.js"></script></head>')
      )
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('não encontrado')
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`andaime da interface em http://127.0.0.1:${PORT}`)
})
