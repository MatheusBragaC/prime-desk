import { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { RpcClient } from './rpc-client.js'
import { listSessions } from './session-catalog.js'
import { getAgentTree } from './agent-tree.js'
import { loadFolders, saveFolders } from './folders.js'
import { listDir, gitBranch, insideRoot, readFileSafe, writeFileSafe, deleteSessionFile } from './files.js'
import { getUsageStats } from './usage.js'
import { generateTitle } from './titles.js'
import { resolveSshExtension, isValidSshTarget } from './ssh.js'
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

function createRpc(cwd: string, model?: string, extraArgs?: string[]): RpcClient {
  const client = new RpcClient({ cwd, model, extraArgs })

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
    titleBarOverlay: { color: '#050506', symbolColor: '#a1a1aa', height: 44 },
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      // electron-vite emite o preload como ESM (.mjs) neste projeto (type: module).
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    event.preventDefault()
    void shell.openExternal(url)
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

ipcMain.handle('bridge:start', async (_e, args: { cwd?: string; model?: string; ssh?: string }) => {
  // Se a ponte já roda, o diretório dela é a verdade. Aceitar um cwd novo aqui
  // faria o explorador apontar para uma pasta onde o agente NÃO está executando.
  if (rpc?.running) {
    return { ok: true, alreadyRunning: true, cwd: workspaceRoot, execution: executionTarget }
  }

  const cwd = args?.cwd || homedir()
  const extraArgs: string[] = []

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
    extraArgs.push('-e', ext, '--ssh', target)
    executionTarget = { kind: 'ssh', target }
  } else {
    executionTarget = { kind: 'local' }
  }

  workspaceRoot = cwd
  rpc = createRpc(cwd, args?.model, extraArgs)
  return { ok: true, cwd, execution: executionTarget }
})

ipcMain.handle('bridge:execution', () => ({ ok: true, execution: executionTarget }))

ipcMain.handle('bridge:stop', () => {
  rpc?.stop()
  rpc = null
  return { ok: true }
})

ipcMain.handle('bridge:send', async (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!rpc?.running) return { ok: false, error: 'Agente não está em execução.' }
  try {
    const res = await rpc.send(args.type, args.payload ?? {})
    return { ok: true, res }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('bridge:fire', (_e, args: { type: string; payload?: Record<string, unknown> }) => {
  if (!rpc?.running) return { ok: false }
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

ipcMain.handle('agents:tree', async () => {
  try {
    return { ok: true, tree: await getAgentTree() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('agents:refresh', () => {
  void tickTree()
  return { ok: true }
})

ipcMain.handle('folders:load', async () => ({ ok: true, state: await loadFolders() }))

ipcMain.handle('folders:save', async (_e, state: FolderState) => ({
  ok: true,
  state: await saveFolders(state)
}))

ipcMain.handle('sessions:transcript', async (_e, path: string) => {
  // Leitura restrita ao diretório do agente: evita virar um leitor de arquivos genérico.
  const agentDir = join(homedir(), '.prime', 'agent')
  if (!path.startsWith(agentDir) || !path.endsWith('.jsonl')) {
    return { ok: false, error: 'Caminho fora do diretório do agente.' }
  }
  try {
    const raw = await readFile(path, 'utf-8')
    const lines = raw.split('\n').filter((l) => l.trim().length > 0)
    return { ok: true, entries: lines.slice(-400).map((l) => JSON.parse(l)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('title:generate', async (_e, conversation: string) => {
  try {
    return { ok: true, title: await generateTitle(conversation, workspaceRoot) }
  } catch {
    return { ok: false, title: null }
  }
})

ipcMain.handle('view:zoom', (_e, level: number) => {
  if (!win || win.isDestroyed()) return { ok: false }
  const clamped = Math.max(-3, Math.min(4, level))
  win.webContents.setZoomLevel(clamped)
  return { ok: true, level: clamped }
})

ipcMain.handle('usage:stats', async () => {
  try {
    return { ok: true, stats: await getUsageStats() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('sessions:list', async () => {
  try {
    return { ok: true, sessions: await listSessions() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('dialog:pickDirectory', async () => {
  if (!win) return { ok: false }
  const r = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Diretório de trabalho do agente'
  })
  if (r.canceled || r.filePaths.length === 0) return { ok: false }
  return { ok: true, path: r.filePaths[0] }
})

ipcMain.handle('dialog:pickImage', async () => {
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

ipcMain.handle('files:list', async (_e, relPath: string) => listDir(workspaceRoot, relPath ?? ''))

ipcMain.handle('files:root', () => ({ ok: true, root: workspaceRoot }))

ipcMain.handle('files:branch', async () => ({ ok: true, branch: await gitBranch(workspaceRoot) }))

ipcMain.handle('files:read', async (_e, relPath: string) => readFileSafe(workspaceRoot, relPath))

ipcMain.handle('files:write', async (_e, args: { path: string; content: string }) =>
  writeFileSafe(workspaceRoot, args.path, args.content)
)

ipcMain.handle('sessions:delete', async (_e, path: string) =>
  deleteSessionFile(join(homedir(), '.prime', 'agent'), path)
)

ipcMain.handle('files:reveal', async (_e, relPath: string) => {
  const target = join(workspaceRoot, relPath)
  if (!insideRoot(workspaceRoot, target)) {
    return { ok: false, error: 'Caminho fora do diretório de trabalho.' }
  }
  const err = await shell.openPath(target)
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('shell:openExternal', (_e, url: string) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  return { ok: true }
})

ipcMain.handle('app:info', () => ({
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

app.on('before-quit', () => rpc?.stop())
