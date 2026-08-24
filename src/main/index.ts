import {
  app, BrowserWindow, ipcMain, shell, dialog, nativeImage, type IpcMainInvokeEvent
} from 'electron'
import { basename, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { RpcClient } from './rpc-client.js'
import { listSessions } from './session-catalog.js'
import { getAgentTree } from './agent-tree.js'
import { execFile } from 'node:child_process'
import { agentBinary, agentEnv } from './agent-path.js'
import { loadFolders, saveFolders } from './folders.js'
import {
  listDir, gitBranch, realPathInside, readFileSafe, writeFileSafe, deleteSessionFile
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
let rpc: RpcClient | null = null

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

function createRpc(
  cwd: string,
  model?: string,
  extraArgs?: string[],
  env?: Record<string, string>
): RpcClient {
  const client = new RpcClient({ cwd, model, extraArgs, env })

  client.on('event', (ev: AgentEvent) => pushToRenderer('agent:event', ev))
  client.on('response', (res: RpcResponse) => pushToRenderer('agent:response', res))
  client.on('stderr', (chunk: string) => pushToRenderer('agent:stderr', chunk))
  client.on('noise', (line: string) => pushToRenderer('agent:stderr', line + '\n'))
  client.on('fatal', (msg: string) => pushToRenderer('agent:fatal', msg))
  client.on('exit', (info: unknown) => pushToRenderer('agent:exit', info))

  client.start()
  return client
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
    backgroundColor: '#050506',
    ...(icon ? { icon } : {}),
    titleBarStyle: 'hidden',
    /*
      `titleBarOverlay` desenha os botões de janela dentro do conteúdo e existe
      só em Windows e Linux. No macOS os controles são os semáforos nativos, à
      esquerda — passar o overlay lá não faz nada e confunde a leitura do código.
    */
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 16 } }
      : { titleBarOverlay: { color: '#050506', symbolColor: '#a1a1aa', height: 44 } }),
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
    startTreePolling()
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
  if (rpc?.running) {
    return { ok: true, alreadyRunning: true, cwd: workspaceRoot, execution: executionTarget }
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
  rpc = createRpc(cwd, args?.model, extraArgs, sshEnv)
  return { ok: true, cwd, execution: executionTarget }
})

handle('bridge:execution', () => ({ ok: true, execution: executionTarget }))

handle('bridge:stop', () => {
  rpc?.stop()
  rpc = null
  return { ok: true }
})

handle('bridge:send', async (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!rpc?.running) return { ok: false, error: 'Agente não está em execução.' }
  if (!RPC_SEND_ALLOWED.has(args?.type)) {
    return { ok: false, error: `Comando RPC não permitido: ${args?.type}` }
  }
  try {
    const res = await rpc.send(args.type, args.payload ?? {})
    return { ok: true, res }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

handle('bridge:fire', (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!rpc?.running) return { ok: false }
  if (!RPC_FIRE_ALLOWED.has(args?.type)) {
    return { ok: false, error: `Comando RPC não permitido: ${args?.type}` }
  }
  rpc.fire(args.type, args.payload ?? {})
  return { ok: true }
})

// Poller da árvore de agentes. Só roda com janela visível: `prime-agent list`
// é um processo separado e não deve girar à toa em background.
let treeTimer: NodeJS.Timeout | null = null
const TREE_INTERVAL_MS = 3000

async function tickTree(): Promise<void> {
  if (!win || win.isDestroyed() || !win.isVisible()) return
  try {
    pushToRenderer('agents:tree', await getAgentTree())
  } catch (err) {
    pushToRenderer('agents:tree-error', err instanceof Error ? err.message : String(err))
  }
}

function startTreePolling(): void {
  if (treeTimer) return
  void tickTree()
  treeTimer = setInterval(() => void tickTree(), TREE_INTERVAL_MS)
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

handle('agents:refresh', () => {
  void tickTree()
  return { ok: true }
})

handle('folders:load', async () => ({ ok: true, state: await loadFolders() }))

handle('folders:save', async (_e, state: FolderState) => ({
  ok: true,
  state: await saveFolders(state)
}))

handle('sessions:transcript', async (_e, path: string) => {
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
    const raw = await readFile(target, 'utf-8')
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    return { ok: true, entries: lines.slice(-400).map((l) => JSON.parse(l)) }
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

handle('dialog:pickImage', async () => {
  if (!win) return { ok: false }
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: 'Anexar imagem',
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })
  if (r.canceled || r.filePaths.length === 0) return { ok: false }
  const path = r.filePaths[0]
  const buf = await readFile(path)
  const ext = path.split('.').pop()!.toLowerCase()
  const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { ok: true, path, data: buf.toString('base64'), mimeType }
})

handle('files:list', async (_e, relPath: string) => listDir(workspaceRoot, relPath ?? ''))

handle('files:root', () => ({ ok: true, root: workspaceRoot }))

handle('files:branch', async () => ({ ok: true, branch: await gitBranch(workspaceRoot) }))

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

app.on('window-all-closed', () => {
  stopTreePolling()
  rpc?.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopEnvWatch()
  rpc?.stop()
})
