import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * Superfície mínima exposta ao renderer. Nenhum acesso a fs, path ou child_process.
 * Credenciais do prime-agent (~/.prime/agent/auth.json) nunca transitam por aqui.
 */
const api = {
  startBridge: (args: {
    cwd?: string
    model?: string
    ssh?: string
    sshPort?: number
    sshIdentity?: string
  }) => ipcRenderer.invoke('bridge:start', args),
  testSsh: (conn: { host: string; port?: number; identity?: string }) =>
    ipcRenderer.invoke('ssh:test', conn),
  listSshConnections: () => ipcRenderer.invoke('ssh:list'),
  saveSshConnections: (list: unknown) => ipcRenderer.invoke('ssh:save', list),
  execution: () => ipcRenderer.invoke('bridge:execution'),
  stopBridge: () => ipcRenderer.invoke('bridge:stop'),
  parkBridge: () => ipcRenderer.invoke('bridge:park'),
  adoptBridge: (id: string) => ipcRenderer.invoke('bridge:adopt', id),
  listParked: () => ipcRenderer.invoke('bridge:parked'),
  markBridge: (args: { sessionPath?: string; sessionId?: string }) =>
    ipcRenderer.invoke('bridge:mark', args),
  send: (type: string, payload?: Record<string, unknown>) =>
    ipcRenderer.invoke('bridge:send', { type, payload }),
  fire: (type: string, payload?: Record<string, unknown>) =>
    ipcRenderer.invoke('bridge:fire', { type, payload }),

  listSessions: () => ipcRenderer.invoke('sessions:list'),
  usageStats: () => ipcRenderer.invoke('usage:stats'),

  checkEnvironment: () => ipcRenderer.invoke('onboarding:check'),
  installCommand: () => ipcRenderer.invoke('onboarding:command'),
  installAgent: () => ipcRenderer.invoke('onboarding:install'),
  openAgentTerminal: () => ipcRenderer.invoke('onboarding:terminal'),
  logoutProvider: (provider: string) => ipcRenderer.invoke('auth:logout', provider),
  checkLoginPort: () => ipcRenderer.invoke('auth:loginPort'),
  watchEnvironment: () => ipcRenderer.invoke('onboarding:watch'),
  unwatchEnvironment: () => ipcRenderer.invoke('onboarding:unwatch'),
  generateTitle: (conversation: string) => ipcRenderer.invoke('title:generate', conversation),
  setZoom: (level: number) => ipcRenderer.invoke('view:zoom', level),
  transcript: (path: string, limit?: number) =>
    ipcRenderer.invoke('sessions:transcript', path, limit),

  agentTree: () => ipcRenderer.invoke('agents:tree'),
  refreshAgentTree: () => ipcRenderer.invoke('agents:refresh'),
  stopAgent: (activeSessionId: string) => ipcRenderer.invoke('agents:stop', activeSessionId),

  listFiles: (relPath: string) => ipcRenderer.invoke('files:list', relPath),
  filesRoot: () => ipcRenderer.invoke('files:root'),
  gitBranch: () => ipcRenderer.invoke('files:branch'),
  gitChanges: () => ipcRenderer.invoke('git:changes'),
  gitDiff: (relPath?: string) => ipcRenderer.invoke('git:diff', relPath),
  revealFile: (relPath: string) => ipcRenderer.invoke('files:reveal', relPath),
  readFile: (relPath: string) => ipcRenderer.invoke('files:read', relPath),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('files:write', { path, content }),
  deleteSession: (path: string) => ipcRenderer.invoke('sessions:delete', path),

  loadFolders: () => ipcRenderer.invoke('folders:load'),
  saveFolders: (state: unknown) => ipcRenderer.invoke('folders:save', state),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),

  on: (channel: string, listener: (payload: unknown) => void) => {
    const allowed = [
      'agent:event', 'agent:response', 'agent:stderr', 'agent:fatal', 'agent:exit',
      'agents:tree', 'agents:tree-error', 'onboarding:output', 'onboarding:env',
      'bridge:parked', 'bridge:run-ended'
    ]
    if (!allowed.includes(channel)) throw new Error(`Canal não permitido: ${channel}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('prime', api)

export type PrimeApi = typeof api
