import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 * Superfície mínima exposta ao renderer. Nenhum acesso a fs, path ou child_process.
 * Credenciais do prime-agent (~/.prime/agent/auth.json) nunca transitam por aqui.
 */
const api = {
  startBridge: (args: { cwd?: string; model?: string }) => ipcRenderer.invoke('bridge:start', args),
  stopBridge: () => ipcRenderer.invoke('bridge:stop'),
  send: (type: string, payload?: Record<string, unknown>) =>
    ipcRenderer.invoke('bridge:send', { type, payload }),
  fire: (type: string, payload?: Record<string, unknown>) =>
    ipcRenderer.invoke('bridge:fire', { type, payload }),

  listSessions: () => ipcRenderer.invoke('sessions:list'),
  transcript: (path: string) => ipcRenderer.invoke('sessions:transcript', path),

  agentTree: () => ipcRenderer.invoke('agents:tree'),
  refreshAgentTree: () => ipcRenderer.invoke('agents:refresh'),

  loadFolders: () => ipcRenderer.invoke('folders:load'),
  saveFolders: (state: unknown) => ipcRenderer.invoke('folders:save', state),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),

  on: (channel: string, listener: (payload: unknown) => void) => {
    const allowed = [
      'agent:event', 'agent:response', 'agent:stderr', 'agent:fatal', 'agent:exit',
      'agents:tree', 'agents:tree-error'
    ]
    if (!allowed.includes(channel)) throw new Error(`Canal não permitido: ${channel}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('prime', api)

export type PrimeApi = typeof api
