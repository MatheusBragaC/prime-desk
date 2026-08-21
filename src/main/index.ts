import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { RpcClient } from './rpc-client.js'
import { listSessions } from './session-catalog.js'
import { getAgentTree } from './agent-tree.js'
import { loadFolders, saveFolders } from './folders.js'
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

function createRpc(cwd: string, model?: string): RpcClient {
  const client = new RpcClient({ cwd, model })

  client.on('event', (ev: AgentEvent) => pushToRenderer('agent:event', ev))
  client.on('response', (res: RpcResponse) => pushToRenderer('agent:response', res))
  client.on('stderr', (chunk: string) => pushToRenderer('agent:stderr', chunk))
  client.on('noise', (line: string) => pushToRenderer('agent:stderr', line + '\n'))
  client.on('fatal', (msg: string) => pushToRenderer('agent:fatal', msg))
  client.on('exit', (info: unknown) => pushToRenderer('agent:exit', info))

  client.start()
  return client
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#050506',
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

ipcMain.handle('bridge:start', (_e, args: { cwd?: string; model?: string }) => {
  const cwd = args?.cwd || homedir()
  if (rpc?.running) return { ok: true, alreadyRunning: true }
  rpc = createRpc(cwd, args?.model)
  return { ok: true, cwd }
})

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
