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
  const state = {
    model: { id: 'claude-fable-5', name: 'Claude Fable 5', api: 'anthropic', provider: 'anthropic', contextWindow: 1000000 },
    thinkingLevel: 'medium', isStreaming: false, isCompacting: false,
    steeringMode: 'one-at-a-time', followUpMode: 'one-at-a-time',
    sessionId: 'stub-session', autoCompactionEnabled: true, messageCount: 2,
    sessionActions: {
      queuedCount: 2,
      steering: ['Confere o teste que quebrou no CI'],
      followUps: ['Depois disso, atualiza o README'],
      active: { kind: 'turn', phase: 'running' }
    },
    goal: { active: false, status: 'idle', tokensUsed: 0, timeUsedSeconds: 0, continuationsUsed: 0 }
  }
  const sessions = [
    { id: 's1', path: '/tmp/s1.jsonl', cwd: '/home/dev/projeto', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), title: 'Configurando GitHub Actions', messageCount: 12, sizeBytes: 4096 },
    { id: 's2', path: '/tmp/s2.jsonl', cwd: '/home/dev/projeto', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), title: 'Otimização de imagem Docker', messageCount: 30, sizeBytes: 8192 }
  ]
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
    get_messages: { messages: [] }
  }
  window.prime = {
    appInfo: async () => ({ version: '0.2.0', home: '/home/dev', platform: 'linux', userName: 'Matheus Carvalho' }),
    checkEnvironment: async () => ({ ok: true, status: {
      agent: { installed: true, path: '/usr/bin/prime-agent', version: '0.8.0' },
      auth: { ok: true, providers: ['anthropic'], envKeys: [] }
    }}),
    startBridge: async () => ({ ok: true, cwd: '/home/dev/projeto', bridgeId: 'b1', execution: { kind: 'local' } }),
    stopBridge: async () => ({ ok: true }),
    execution: async () => ({ ok: true, execution: { kind: 'local' } }),
    send: async (type) => ({ ok: true, res: { type: 'response', command: type, success: true, data: rpc[type] ?? {} } }),
    fire: async () => ({ ok: true }),
    listSessions: async () => ({ ok: true, sessions }),
    loadFolders: async () => ({ ok: true, state: { folders: [], assignments: {}, collapsed: {} } }),
    saveFolders: async (s) => ({ ok: true, state: s }),
    usageStats: async () => ({ ok: true, stats: { sessions: 2, messages: 42, tokens: 170398, input: 30, output: 8219, cacheRead: 140436, cacheWrite: 21713, cost: 0.3, activeDays: 3, currentStreak: 2, longestStreak: 5, favoriteModel: 'claude-fable-5', peakHour: 15, days: [] } }),
    agentTree: async () => ({ ok: true, tree: { roots: [], total: 0, subagents: 0, at: Date.now() } }),
    setAgentCadence: async () => ({ ok: true }),
    refreshAgentTree: async () => ({ ok: true }),
    filesRoot: async () => ({ ok: true, root: '/home/dev/projeto' }),
    listFiles: async () => ({ ok: true, entries: [
      { name: 'src', path: 'src', isDir: true, size: 0 },
      { name: 'package.json', path: 'package.json', isDir: false, size: 2148 }
    ] }),
    gitBranch: async () => ({ ok: true, branch: 'main' }),
    gitChanges: async () => ({ ok: true, changes: [
      { path: 'src/App.tsx', status: ' M', added: 12, removed: 3 }
    ] }),
    gitDiff: async () => ({ ok: true, diff: '@@ -1 +1 @@\\n-antes\\n+depois', truncated: false }),
    readFile: async () => ({ ok: true, content: '// exemplo', size: 12, binary: false }),
    writeFile: async () => ({ ok: true }),
    transcript: async () => ({ ok: true, messages: [] }),
    listParked: async () => ({ ok: true, parked: [] }),
    listSshConnections: async () => ({ ok: true, connections: [] }),
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
    generateTitle: async () => ({ ok: true, title: null }),
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
  window.__harness = { emit: (ch, p) => (listeners[ch] ?? []).forEach((f) => f(p)) }
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
