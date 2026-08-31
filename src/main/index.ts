import {
  app, BrowserWindow, ipcMain, shell, dialog, nativeImage, type IpcMainInvokeEvent
} from 'electron'
import { basename, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFile, stat, open } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { RpcClient } from './rpc-client.js'
import { listSessions } from './session-catalog.js'
import { getAgentTree } from './agent-tree.js'
import { execFile } from 'node:child_process'
import { agentBinary, agentEnv } from './agent-path.js'
import { loadFolders, saveFolders } from './folders.js'
import {
  listDir, gitBranch, gitChanges, gitDiff, realPathInside, readFileSafe, writeFileSafe,
  deleteSessionFile
} from './files.js'
import { getUsageStats } from './usage.js'
import {
  checkEnvironment, installAgent, openAgentTerminal, logoutProvider, checkLoginPort,
  startEnvWatch, stopEnvWatch, INSTALL_COMMAND
} from './onboarding.js'
import { generateTitle } from './titles.js'
import {
  resolveSshExtension, isValidSshTarget, testConnection, prepareSshShim,
  loadConnections, saveConnections, type SshConnection, type SshShim
} from './ssh.js'
import type { FolderState } from '../shared/protocol.js'
import type { AgentEvent, RpcResponse } from '../shared/protocol.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

/**
 * Em Ubuntu 24.04 o AppArmor restringe user namespaces sem privilégio
 * (kernel.apparmor_restrict_unprivileged_userns=1), então o Chromium exige o
 * helper setuid `chrome-sandbox` com owner root e modo 4755.
 *
 * A correção certa é ajustar essa permissão (ver README). Desligar o sandbox é
 * apenas um escape para desenvolvimento e precisa ser pedido explicitamente,
 * nunca aplicado em silêncio.
 */
if (process.env.PRIME_DESK_NO_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox')
  console.warn('[prime-desk] sandbox do Chromium DESLIGADO via PRIME_DESK_NO_SANDBOX=1')
}

let win: BrowserWindow | null = null

function pushToRenderer(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/**
 * Origem legítima do IPC.
 *
 * O app não tem iframe, webview nem navegação interna, então a única origem
 * esperada é o frame principal da janela. Qualquer outra é sinal de conteúdo
 * injetado, não de uso normal — e como `bridge:send` fala com um agente que tem
 * ferramenta `bash`, o custo de não checar é alto.
 */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  if (!win || win.isDestroyed()) return false
  if (event.sender !== win.webContents) return false
  try {
    // `senderFrame` lança se o frame já sumiu (janela fechando durante a chamada).
    return event.senderFrame === null || event.senderFrame === event.sender.mainFrame
  } catch {
    return false
  }
}

/** `any[]` para aceitar a assinatura já tipada de cada handler existente. */
type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

/** `ipcMain.handle` com a guarda de origem aplicada em ponto único. */
function handle(channel: string, fn: IpcHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Origem IPC não autorizada.' }
    return fn(event, ...args)
  })
}

/**
 * Porta única de saída para o navegador do sistema.
 *
 * `shell.openExternal` aceita qualquer esquema registrado no SO — `file:`,
 * `smb:`, `ms-msdt:` — então validar em cada chamador convidava ao esquecimento
 * (era o caso de `setWindowOpenHandler` e `will-navigate`, que não validavam
 * nada). Devolve se abriu, para o chamador poder reportar.
 */
function openExternalSafe(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  void shell.openExternal(parsed.toString())
  return true
}

/** Extensões que o desktop executa em vez de abrir. */
const NEVER_OPEN = new Set([
  'desktop', 'sh', 'bash', 'zsh', 'fish', 'run', 'appimage', 'bin', 'exe',
  'msi', 'bat', 'cmd', 'com', 'ps1', 'scr', 'vbs', 'jar', 'app', 'command',
  'pkg', 'deb', 'rpm'
])

async function isRiskyToOpen(target: string): Promise<boolean> {
  const ext = basename(target).split('.').pop()?.toLowerCase() ?? ''
  if (NEVER_OPEN.has(ext)) return true
  try {
    const st = await stat(target)
    return st.isFile() && (st.mode & 0o111) !== 0
  } catch {
    return true
  }
}

/**
 * Tipos RPC que a UI realmente usa.
 *
 * O renderer podia mandar qualquer `type` ao agente, e o agente tem ferramenta
 * `bash` — logo, execução de script no renderer valia RCE local. Esta lista é o
 * contrato: comando novo na UI precisa entrar aqui, e o erro nomeia o tipo para
 * o esquecimento não virar bug silencioso.
 */
const RPC_SEND_ALLOWED = new Set([
  'clone', 'compact', 'get_available_models', 'get_commands', 'get_messages',
  'get_state', 'new_session', 'observe', 'prompt', 'set_model',
  'set_session_name', 'set_thinking_level', 'switch_session'
])

/** `fire` não espera resposta: só o que precisa furar a fila. */
const RPC_FIRE_ALLOWED = new Set(['abort', 'unobserve'])

/**
 * Uma ponte é um processo `prime-agent --mode rpc` com a sessão que ele carrega.
 *
 * O worker do daemon carrega uma sessão por vez, então trocar de conversa dentro
 * da mesma ponte mata o turno em andamento. Medido nesta base: **dois clientes
 * RPC coexistem**, cada um com sua sessão. Por isso, em vez de abortar, a ponte
 * que está executando é *estacionada* e uma nova sobe para a conversa de destino.
 */
interface Bridge {
  id: string
  client: RpcClient
  cwd: string
  execution: { kind: 'local' | 'ssh'; target?: string }
  /** Turno em andamento, deduzido de `agent_start` / `agent_end`. */
  running: boolean
  sessionId?: string
  sessionPath?: string
}

let active: Bridge | null = null

/** Pontes que seguem executando enquanto o usuário olha outra conversa. */
const parked = new Map<string, Bridge>()

/**
 * Teto de pontes estacionadas. Cada uma é um processo e um worker do daemon;
 * sem limite, trocar de conversa repetidamente viraria um vazamento.
 */
const MAX_PARKED = 3

let bridgeSeq = 0

function parkedSnapshot(): Array<{
  id: string
  cwd: string
  running: boolean
  sessionId?: string
  sessionPath?: string
}> {
  return [...parked.values()].map((b) => ({
    id: b.id,
    cwd: b.cwd,
    running: b.running,
    sessionId: b.sessionId,
    sessionPath: b.sessionPath
  }))
}

function announceParked(): void {
  pushToRenderer('bridge:parked', parkedSnapshot())
}

/**
 * O turno de uma ponte estacionada terminou.
 *
 * A ponte é encerrada: manter o worker vivo depois do fim só prenderia a sessão
 * (`already active in <worker>`) sem oferecer nada — reabrir a conversa lê a
 * transcrição do disco, que a essa altura já está completa.
 */
function retireParked(b: Bridge): void {
  parked.delete(b.id)
  b.client.stop()
  pushToRenderer('bridge:run-ended', {
    id: b.id,
    sessionId: b.sessionId,
    sessionPath: b.sessionPath
  })
  announceParked()
}

function createBridge(
  cwd: string,
  execution: { kind: 'local' | 'ssh'; target?: string },
  model?: string,
  extraArgs?: string[],
  env?: Record<string, string>
): Bridge {
  const id = 'b' + ++bridgeSeq
  const client = new RpcClient({ cwd, model, extraArgs, env })
  const bridge: Bridge = { id, client, cwd, execution, running: false }

  client.on('event', (ev: AgentEvent) => {
    if (ev.type === 'agent_start') bridge.running = true
    if (ev.type === 'agent_end') {
      bridge.running = false
      if (parked.has(id)) {
        retireParked(bridge)
        return
      }
    }
    const sid = (ev as { sessionId?: string }).sessionId
    if (sid) bridge.sessionId = sid
    // Carimbo de origem: o renderer descarta o que não vem da ponte ativa.
    pushToRenderer('agent:event', { ...ev, bridgeId: id })
  })

  // Os demais canais só interessam para a ponte ativa: uma estacionada que
  // escreve em stderr não deve pintar erro na conversa que está na tela.
  client.on('response', (res: RpcResponse) => {
    if (active?.id === id) pushToRenderer('agent:response', res)
  })
  client.on('stderr', (chunk: string) => {
    if (active?.id === id) pushToRenderer('agent:stderr', chunk)
  })
  client.on('noise', (line: string) => {
    if (active?.id === id) pushToRenderer('agent:stderr', line + '\n')
  })
  client.on('fatal', (msg: string) => {
    if (active?.id === id) pushToRenderer('agent:fatal', msg)
  })
  client.on('exit', (info: unknown) => {
    if (active?.id === id) pushToRenderer('agent:exit', info)
    else if (parked.has(id)) retireParked(bridge)
  })

  client.start()
  return bridge
}

function resolveIcon(): string | undefined {
  // Empacotado, o ícone vem do bundle do electron-builder; em dev, de build/.
  const candidates = [
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const icon = resolveIcon()

  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0f',
    ...(icon ? { icon } : {}),
    titleBarStyle: 'hidden',
    /*
      `titleBarOverlay` desenha os botões de janela dentro do conteúdo e existe
      só em Windows e Linux. No macOS os controles são os semáforos nativos, à
      esquerda — passar o overlay lá não faz nada e confunde a leitura do código.
    */
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 16 } }
      : { titleBarOverlay: { color: '#0b0b0f', symbolColor: '#a3a3ae', height: 44 } }),
    webPreferences: {
      // Preload em CommonJS (.cjs): renderer sandboxed não carrega preload ESM.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => {
    // No Linux a opção `icon` do construtor nem sempre pega; setIcon é confiável.
    if (icon) {
      const image = nativeImage.createFromPath(icon)
      if (!image.isEmpty()) win?.setIcon(image)
    }
    win?.show()
    // O ritmo vem do renderer; aqui a janela só fica elegível a rodar.
  })

  win.on('hide', stopTreePolling)
  win.on('show', startTreePolling)
  win.on('minimize', stopTreePolling)
  win.on('restore', startTreePolling)

  // Nada de navegação dentro do app: links vão para o navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    openExternalSafe(url)
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (isDev && devServer) {
    void win.loadURL(devServer)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    stopTreePolling()
    win = null
  })
}

// ---------------------------------------------------------------- IPC

/** Raiz do explorador de arquivos = cwd onde o agente está executando. */
let workspaceRoot = homedir()

let executionTarget: { kind: 'local' | 'ssh'; target?: string } = { kind: 'local' }

handle('ssh:test', async (_e, conn: { host: string; port?: number; identity?: string }) =>
  testConnection(conn)
)

handle('ssh:list', async () => ({ ok: true, connections: await loadConnections() }))

handle('ssh:save', async (_e, list: SshConnection[]) => ({
  ok: true,
  connections: await saveConnections(list)
}))

handle('bridge:start', async (
  _e,
  args: { cwd?: string; model?: string; ssh?: string; sshPort?: number; sshIdentity?: string }
) => {
  // Se a ponte já roda, o diretório dela é a verdade. Aceitar um cwd novo aqui
  // faria o explorador apontar para uma pasta onde o agente NÃO está executando.
  if (active?.client.running) {
    return {
      ok: true,
      alreadyRunning: true,
      cwd: workspaceRoot,
      execution: executionTarget,
      bridgeId: active.id
    }
  }

  const cwd = args?.cwd || homedir()
  const extraArgs: string[] = []
  let sshEnv: Record<string, string> | undefined

  if (args?.ssh) {
    const target = args.ssh.trim()
    if (!isValidSshTarget(target)) {
      return { ok: false, error: 'Alvo SSH inválido. Use usuário@host ou usuário@host:/caminho.' }
    }
    const ext = await resolveSshExtension()
    if (!ext) {
      return {
        ok: false,
        error: 'Extensão SSH do prime-agent não encontrada (examples/extensions/ssh.ts).'
      }
    }
    /**
     * Porta e chave entram por um `ssh` próprio na frente do PATH do agente.
     * Preparado ANTES de mutar estado: entrada inválida não pode deixar
     * `executionTarget` marcado como SSH sem conexão correspondente.
     */
    let shim: SshShim | null
    try {
      shim = await prepareSshShim({ port: args.sshPort, identity: args.sshIdentity })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }

    extraArgs.push('-e', ext, '--ssh', target)
    executionTarget = { kind: 'ssh', target }
    if (shim) sshEnv = { ...shim.env, PATH: `${shim.dir}:${process.env.PATH ?? ''}` }
  } else {
    executionTarget = { kind: 'local' }
  }

  workspaceRoot = cwd
  active = createBridge(cwd, executionTarget, args?.model, extraArgs, sshEnv)
  return { ok: true, cwd, execution: executionTarget, bridgeId: active.id }
})

/**
 * Estaciona a ponte ativa em vez de encerrá-la.
 *
 * Chamado quando o usuário troca de conversa com um turno rodando: o processo
 * continua, o turno segue até o fim e o renderer é avisado quando terminar.
 */
handle('bridge:park', () => {
  if (!active) return { ok: false, error: 'Nenhuma ponte ativa.' }
  if (!active.client.running) return { ok: false, error: 'A ponte não está em execução.' }

  const b = active
  active = null
  parked.set(b.id, b)

  // Estouro do teto: a estacionada mais antiga que já parou cede o lugar.
  if (parked.size > MAX_PARKED) {
    const idle = [...parked.values()].find((x) => !x.running)
    if (idle) retireParked(idle)
  }

  announceParked()
  return { ok: true, parkedId: b.id, sessionId: b.sessionId, sessionPath: b.sessionPath }
})

/** Volta para uma ponte estacionada, tornando-a a ativa de novo. */
handle('bridge:adopt', (_e, id: string) => {
  const b = parked.get(id)
  if (!b) return { ok: false, error: 'Ponte não está mais estacionada.' }

  parked.delete(id)
  // A que estava ativa sai de cena; se estivesse rodando, o renderer teria
  // estacionado antes de chamar aqui.
  if (active && active.id !== id) active.client.stop()

  active = b
  workspaceRoot = b.cwd
  executionTarget = b.execution
  announceParked()
  return { ok: true, cwd: b.cwd, execution: b.execution, bridgeId: b.id }
})

handle('bridge:parked', () => ({ ok: true, parked: parkedSnapshot() }))

/** Registra qual sessão a ponte ativa carrega, para reconhecê-la depois. */
handle('bridge:mark', (_e, args: { sessionPath?: string; sessionId?: string }) => {
  if (!active) return { ok: false }
  if (args?.sessionPath) active.sessionPath = args.sessionPath
  if (args?.sessionId) active.sessionId = args.sessionId
  return { ok: true }
})

handle('bridge:execution', () => ({ ok: true, execution: executionTarget }))

handle('bridge:stop', () => {
  // Só a ativa: as estacionadas seguem até o fim do turno delas.
  active?.client.stop()
  active = null
  return { ok: true }
})

handle('bridge:send', async (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!active?.client.running) return { ok: false, error: 'Agente não está em execução.' }
  if (!RPC_SEND_ALLOWED.has(args?.type)) {
    return { ok: false, error: `Comando RPC não permitido: ${args?.type}` }
  }
  try {
    const res = await active.client.send(args.type, args.payload ?? {})
    return { ok: true, res }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('bridge:fire', (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!active?.client.running) return { ok: false }
  if (!RPC_FIRE_ALLOWED.has(args?.type)) {
    return { ok: false, error: `Comando RPC não permitido: ${args?.type}` }
  }
  active.client.fire(args.type, args.payload ?? {})
  return { ok: true }
})

/*
  Poller da árvore de agentes.

  Cada ciclo dispara um `prime-agent list`, que **medido nesta máquina custa
  0,67s de CPU**. Fixo a cada 3s, isso é ~22% de um núcleo queimado o tempo
  todo — inclusive com o app parado, sem turno e sem ninguém olhando o painel.
  Quem manda no ritmo agora é o renderer, que sabe o que está na tela:

    painel de agentes aberto ....... 2s
    turno rodando, painel fechado .. 8s   (só para acender o selo de subagentes)
    parado ......................... desligado

  Janela escondida ou minimizada continua parando tudo, como antes.
*/
let treeTimer: NodeJS.Timeout | null = null
let treeCadenceMs = 0

async function tickTree(): Promise<void> {
  if (!win || win.isDestroyed() || !win.isVisible()) return
  try {
    pushToRenderer('agents:tree', await getAgentTree())
  } catch (err) {
    pushToRenderer('agents:tree-error', err instanceof Error ? err.message : String(err))
  }
}

function startTreePolling(): void {
  if (treeTimer || treeCadenceMs <= 0) return
  void tickTree()
  treeTimer = setInterval(() => void tickTree(), treeCadenceMs)
}

/**
 * Define o ritmo pedido pelo renderer. `0` desliga.
 *
 * Ao desligar, ainda roda um ciclo final: senão o selo de subagentes ficaria
 * congelado no último número visto, mostrando trabalho que já terminou.
 */
function setTreeCadence(ms: number): void {
  if (ms === treeCadenceMs) return
  const wasOn = treeCadenceMs > 0
  treeCadenceMs = ms
  stopTreePolling()
  if (ms > 0) startTreePolling()
  else if (wasOn) void tickTree()
}

function stopTreePolling(): void {
  if (treeTimer) clearInterval(treeTimer)
  treeTimer = null
}

handle('agents:tree', async () => {
  try {
    return { ok: true, tree: await getAgentTree() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/**
 * Encerra outro agente do daemon.
 *
 * Fechar o TUI apenas desconecta o cliente: o worker continua residente e
 * segura o arquivo da sessão. Sem isto, a GUI informava o conflito mas não
 * oferecia nenhuma forma de resolvê-lo.
 */
handle('agents:stop', async (_e, activeSessionId: string) => {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(String(activeSessionId ?? ''))) {
    return { ok: false, error: 'Identificador de agente inválido.' }
  }
  return new Promise((resolve) => {
    execFile(
      agentBinary(),
      ['stop', activeSessionId],
      { timeout: 20_000, env: agentEnv({ NO_COLOR: '1' }) },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: `${stderr || stdout || err.message}`.trim().split('\n')[0] })
          return
        }
        resolve({ ok: true })
      }
    )
  })
})

handle('agents:cadence', (_e, ms: number) => {
  setTreeCadence(Math.max(0, Math.min(60_000, Number(ms) || 0)))
  return { ok: true }
})

handle('agents:refresh', () => {
  void tickTree()
  return { ok: true }
})

handle('folders:load', async () => ({ ok: true, state: await loadFolders() }))

handle('folders:save', async (_e, state: FolderState) => ({
  ok: true,
  state: await saveFolders(state)
}))

handle('sessions:transcript', async (_e, path: string, limit = 400) => {
  /**
   * Leitura restrita ao diretório do agente: evita virar um leitor de arquivos
   * genérico.
   *
   * `startsWith` não servia como guarda: comparava string crua, então
   * `<agentDir>/../../../etc/passwd.jsonl` passava (o `..` só colapsa no
   * `resolve`) e `<agentDir>-backup/x.jsonl` também, por ser prefixo sem
   * separador. `realPathInside` normaliza, exige o separador e ainda resolve
   * symlink.
   */
  const agentDir = join(homedir(), '.prime', 'agent')
  const target = await realPathInside(agentDir, path)
  if (!target || !target.endsWith('.jsonl')) {
    return { ok: false, error: 'Caminho fora do diretório do agente.' }
  }
  try {
    /*
      Lê só o fim do arquivo, não ele inteiro.

      `get_messages` devolve a conversa completa pelo RPC: numa sessão de 13 MB
      isso levou 6 s e trafegou 12,5 MB, o grosso do tempo de troca de conversa.
      O arquivo tem a mesma informação — e como só a cauda é exibida, nem ele
      precisa entrar em memória por completo.
    */
    const TAIL_BYTES = 4 * 1024 * 1024
    const info = await stat(target)
    const start = Math.max(0, info.size - TAIL_BYTES)

    const fh = await open(target, 'r')
    let raw: string
    try {
      const length = info.size - start
      const buf = Buffer.alloc(length)
      await fh.read(buf, 0, length, start)
      raw = buf.toString('utf-8')
    } finally {
      await fh.close()
    }

    // Começando no meio do arquivo, a primeira linha vem cortada.
    if (start > 0) raw = raw.slice(raw.indexOf('\n') + 1)

    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    const entries: unknown[] = []
    for (const line of lines.slice(-limit)) {
      try {
        entries.push(JSON.parse(line))
      } catch {
        // Linha corrompida não deve impedir a leitura do restante.
      }
    }
    return { ok: true, entries }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('onboarding:check', async () => {
  try {
    return { ok: true, status: await checkEnvironment() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('onboarding:command', () => ({ ok: true, command: INSTALL_COMMAND }))

handle('onboarding:install', async () => {
  const result = await installAgent((chunk) => pushToRenderer('onboarding:output', chunk))
  return result
})

handle('onboarding:terminal', async () => openAgentTerminal())

handle('auth:logout', async (_e, provider: string) => logoutProvider(provider))

handle('auth:loginPort', async () => checkLoginPort())

handle('onboarding:watch', () => {
  startEnvWatch((status) => pushToRenderer('onboarding:env', status))
  return { ok: true }
})

handle('onboarding:unwatch', () => {
  stopEnvWatch()
  return { ok: true }
})

handle('title:generate', async (_e, conversation: string) => {
  try {
    return { ok: true, title: await generateTitle(conversation, workspaceRoot) }
  } catch {
    return { ok: false, title: null }
  }
})

handle('view:zoom', (_e, level: number) => {
  if (!win || win.isDestroyed()) return { ok: false }
  const clamped = Math.max(-3, Math.min(4, level))
  win.webContents.setZoomLevel(clamped)
  return { ok: true, level: clamped }
})

handle('usage:stats', async () => {
  try {
    return { ok: true, stats: await getUsageStats() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('sessions:list', async () => {
  try {
    return { ok: true, sessions: await listSessions() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('dialog:pickDirectory', async () => {
  if (!win) return { ok: false }
  const r = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Diretório de trabalho do agente'
  })
  if (r.canceled || r.filePaths.length === 0) return { ok: false }
  return { ok: true, path: r.filePaths[0] }
})

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/**
 * Seletor de anexo.
 *
 * O RPC do prime-agent aceita **só imagem** (`ImageContent`); a doc dele lista a
 * entrada do modelo como `["text", "image"]`. Então PDF, planilha ou código não
 * viram anexo: o que volta é o caminho, e o agente lê o arquivo com as próprias
 * ferramentas — que é o caminho mais barato de qualquer forma, já que ele tem
 * disco e IPython à disposição.
 */
handle('dialog:pickAttachment', async () => {
  if (!win) return { ok: false }
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    title: 'Anexar arquivo',
    filters: [
      { name: 'Todos os arquivos', extensions: ['*'] },
      { name: 'Imagens', extensions: [...IMAGE_EXT] }
    ]
  })
  if (r.canceled || r.filePaths.length === 0) return { ok: false }

  const picked = await Promise.all(
    r.filePaths.map(async (path) => {
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      if (!IMAGE_EXT.has(ext)) return { path, isImage: false as const }
      const buf = await readFile(path)
      const mimeType =
        ext === 'png' ? 'image/png'
        : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : 'image/jpeg'
      return { path, isImage: true as const, data: buf.toString('base64'), mimeType }
    })
  )
  return { ok: true, picked }
})

handle('files:list', async (_e, relPath: string) => listDir(workspaceRoot, relPath ?? ''))

handle('files:root', () => ({ ok: true, root: workspaceRoot }))

handle('files:branch', async () => ({ ok: true, branch: await gitBranch(workspaceRoot) }))

handle('git:changes', async () => gitChanges(workspaceRoot))

handle('git:diff', async (_e, relPath?: string) => gitDiff(workspaceRoot, relPath))

handle('files:read', async (_e, relPath: string) => readFileSafe(workspaceRoot, relPath))

handle('files:write', async (_e, args: { path: string; content: string }) =>
  writeFileSafe(workspaceRoot, args.path, args.content)
)

handle('sessions:delete', async (_e, path: string) =>
  deleteSessionFile(join(homedir(), '.prime', 'agent'), path)
)

handle('files:reveal', async (_e, relPath: string) => {
  const target = await realPathInside(workspaceRoot, join(workspaceRoot, relPath))
  if (!target) {
    return { ok: false, error: 'Caminho fora do diretório de trabalho.' }
  }

  /**
   * `openPath` entrega o alvo ao handler do desktop, então um `.desktop`, um
   * script ou qualquer arquivo com bit de execução seria EXECUTADO, não aberto.
   * Nesses casos revelamos no gerenciador de arquivos: o botão continua útil
   * sem virar atalho para rodar binário que veio dentro do workspace.
   */
  if (await isRiskyToOpen(target)) {
    shell.showItemInFolder(target)
    return { ok: true, revealed: true }
  }

  const err = await shell.openPath(target)
  return err ? { ok: false, error: err } : { ok: true }
})

handle('shell:openExternal', (_e, url: string) => ({ ok: openExternalSafe(url) }))

handle('app:info', () => ({
  version: app.getVersion(),
  home: homedir(),
  platform: process.platform
}))

// ---------------------------------------------------------------- lifecycle

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function stopAllBridges(): void {
  active?.client.stop()
  active = null
  for (const b of parked.values()) b.client.stop()
  parked.clear()
}

app.on('window-all-closed', () => {
  stopTreePolling()
  stopAllBridges()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopEnvWatch()
  stopAllBridges()
})
