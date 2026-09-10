import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/protocol'
import type {
  AgentTreeSnapshot, AppInfo, DirEntry, EnvStatus, Envelope, ExecutionInfo, FolderState,
  GitBranchInfo, GitChange, IpcChannel, IpcEvents, ParkedRun, PickedAttachment, RpcResponse,
  SessionSummary, SpeechStatus, SshConnection, SshTestResult, UpdateCheck, UsageStats
} from '../shared/protocol'

/**
 * Superfície mínima exposta ao renderer. Nenhum acesso a fs, path ou child_process.
 * Credenciais do prime-agent (~/.prime/agent/auth.json) nunca transitam por aqui.
 *
 * Cada método declara o retorno. `ipcRenderer.invoke` devolve `Promise<any>`, e
 * como `global.d.ts` publica `typeof api` como `window.prime`, sem a anotação o
 * renderer inteiro lia `any`: campo inexistente compilava e só quebrava em uso.
 * O tipo declarado aqui é o contrato do handler correspondente em `src/main`.
 */
const api = {
  startBridge: (args: {
    cwd?: string
    model?: string
    ssh?: string
    sshPort?: number
    sshIdentity?: string
  }): Promise<Envelope<{
    cwd: string
    execution: ExecutionInfo
    bridgeId: string
    /** A ponte já estava de pé: o `cwd` devolvido é o dela, não o pedido. */
    alreadyRunning?: boolean
  }>> => ipcRenderer.invoke('bridge:start', args),
  testSsh: (conn: { host: string; port?: number; identity?: string }): Promise<SshTestResult> =>
    ipcRenderer.invoke('ssh:test', conn),
  listSshConnections: (): Promise<Envelope<{ connections: SshConnection[] }>> =>
    ipcRenderer.invoke('ssh:list'),
  saveSshConnections: (
    list: readonly SshConnection[]
  ): Promise<Envelope<{ connections: SshConnection[] }>> => ipcRenderer.invoke('ssh:save', list),
  stopBridge: (): Promise<Envelope> => ipcRenderer.invoke('bridge:stop'),
  parkBridge: (): Promise<Envelope<{
    parkedId: string
    sessionId?: string
    sessionPath?: string
  }>> => ipcRenderer.invoke('bridge:park'),
  adoptBridge: (
    id: string
  ): Promise<Envelope<{ cwd: string; execution: ExecutionInfo; bridgeId: string }>> =>
    ipcRenderer.invoke('bridge:adopt', id),
  listParked: (): Promise<Envelope<{ parked: ParkedRun[] }>> => ipcRenderer.invoke('bridge:parked'),
  markBridge: (args: { sessionPath?: string; sessionId?: string }): Promise<Envelope> =>
    ipcRenderer.invoke('bridge:mark', args),
  send: (
    type: string,
    payload?: Record<string, unknown>
  ): Promise<Envelope<{ res: RpcResponse }>> =>
    ipcRenderer.invoke('bridge:send', { type, payload }),
  fire: (type: string, payload?: Record<string, unknown>): Promise<Envelope> =>
    ipcRenderer.invoke('bridge:fire', { type, payload }),

  listSessions: (): Promise<Envelope<{ sessions: SessionSummary[] }>> =>
    ipcRenderer.invoke('sessions:list'),
  usageStats: (): Promise<Envelope<{ stats: UsageStats }>> => ipcRenderer.invoke('usage:stats'),

  checkEnvironment: (): Promise<Envelope<{ status: EnvStatus }>> =>
    ipcRenderer.invoke('onboarding:check'),
  installCommand: (): Promise<Envelope<{ command: string }>> =>
    ipcRenderer.invoke('onboarding:command'),
  /** Fora do envelope: `code` é o do processo de instalação, e importa mesmo em falha. */
  installAgent: (): Promise<{ ok: boolean; code: number }> =>
    ipcRenderer.invoke('onboarding:install'),
  openAgentTerminal: (): Promise<{ ok: boolean; error?: string; command: string }> =>
    ipcRenderer.invoke('onboarding:terminal'),
  logoutProvider: (provider: string): Promise<Envelope> =>
    ipcRenderer.invoke('auth:logout', provider),
  checkLoginPort: (): Promise<{ free: boolean; port: number }> =>
    ipcRenderer.invoke('auth:loginPort'),
  watchEnvironment: (): Promise<Envelope> => ipcRenderer.invoke('onboarding:watch'),
  unwatchEnvironment: (): Promise<Envelope> => ipcRenderer.invoke('onboarding:unwatch'),
  generateTitle: (conversation: string): Promise<Envelope<{ title: string | null }>> =>
    ipcRenderer.invoke('title:generate', conversation),
  setZoom: (level: number): Promise<Envelope<{ level: number }>> =>
    ipcRenderer.invoke('view:zoom', level),
  /** Linhas cruas do JSONL da sessão: o formato é do agente, não deste app. */
  transcript: (path: string, limit?: number): Promise<Envelope<{ entries: unknown[] }>> =>
    ipcRenderer.invoke('sessions:transcript', path, limit),

  agentTree: (): Promise<Envelope<{ tree: AgentTreeSnapshot }>> => ipcRenderer.invoke('agents:tree'),
  refreshAgentTree: (): Promise<Envelope> => ipcRenderer.invoke('agents:refresh'),
  setAgentCadence: (ms: number): Promise<Envelope> => ipcRenderer.invoke('agents:cadence', ms),
  stopAgent: (activeSessionId: string): Promise<Envelope> =>
    ipcRenderer.invoke('agents:stop', activeSessionId),

  listFiles: (relPath: string): Promise<Envelope<{ entries: DirEntry[] }>> =>
    ipcRenderer.invoke('files:list', relPath),
  filesRoot: (): Promise<Envelope<{ root: string }>> => ipcRenderer.invoke('files:root'),
  gitBranch: (): Promise<Envelope<{ branch: string | null }>> =>
    ipcRenderer.invoke('files:branch'),
  gitChanges: (): Promise<Envelope<{ changes: GitChange[] }>> => ipcRenderer.invoke('git:changes'),
  gitBranches: (): Promise<Envelope<{ branches: GitBranchInfo[]; dirty: boolean }>> =>
    ipcRenderer.invoke('git:branches'),
  gitCheckout: (branch: string): Promise<Envelope> => ipcRenderer.invoke('git:checkout', branch),
  gitDiff: (relPath?: string): Promise<Envelope<{ diff: string; truncated?: boolean }>> =>
    ipcRenderer.invoke('git:diff', relPath),
  revealFile: (relPath: string): Promise<Envelope<{ revealed?: boolean }>> =>
    ipcRenderer.invoke('files:reveal', relPath),
  /** `content` falta quando o arquivo é binário — aí só `size` e `binary` vêm. */
  readFile: (relPath: string): Promise<Envelope<{
    content?: string
    size: number
    truncated?: boolean
    binary?: boolean
  }>> => ipcRenderer.invoke('files:read', relPath),
  writeFile: (path: string, content: string): Promise<Envelope<{ size: number }>> =>
    ipcRenderer.invoke('files:write', { path, content }),
  deleteSession: (path: string): Promise<Envelope> => ipcRenderer.invoke('sessions:delete', path),

  loadFolders: (): Promise<Envelope<{ state: FolderState }>> => ipcRenderer.invoke('folders:load'),
  saveFolders: (state: FolderState): Promise<Envelope<{ state: FolderState }>> =>
    ipcRenderer.invoke('folders:save', state),
  pickDirectory: (): Promise<Envelope<{ path: string }>> =>
    ipcRenderer.invoke('dialog:pickDirectory'),
  pickAttachment: (): Promise<Envelope<{ picked: PickedAttachment[] }>> =>
    ipcRenderer.invoke('dialog:pickAttachment'),
  pickWorkspaceFile: (): Promise<Envelope<{ path: string }>> =>
    ipcRenderer.invoke('dialog:pickWorkspaceFile'),
  /*
    Caminho real de um arquivo arrastado. Com `sandbox: true` o `File.path` do
    DOM nao existe mais; `webUtils.getPathForFile` e a via suportada, e precisa
    rodar no preload.
  */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  openExternal: (url: string): Promise<Envelope> => ipcRenderer.invoke('shell:openExternal', url),
  copyText: (text: string): Promise<Envelope> => ipcRenderer.invoke('clipboard:write', text),
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  checkAgentUpdate: (): Promise<Envelope<{ update: UpdateCheck }>> =>
    ipcRenderer.invoke('updates:check'),
  /** Versão nova do PRÓPRIO app; `command` é o que instala, para rodar no terminal. */
  checkAppUpdate: (): Promise<Envelope<{ update: UpdateCheck; command: string }>> =>
    ipcRenderer.invoke('updates:app'),
  rescanAgent: (): Promise<Envelope<{ status: EnvStatus }>> => ipcRenderer.invoke('updates:rescan'),
  speechStatus: (): Promise<Envelope<{ status: SpeechStatus }>> =>
    ipcRenderer.invoke('speech:status'),
  speechSetupCommand: (modelId: string): Promise<Envelope<{ command: string }>> =>
    ipcRenderer.invoke('speech:setupCommand', modelId),
  speechStart: (modelId: string): Promise<Envelope> => ipcRenderer.invoke('speech:start', modelId),
  speechStop: (): Promise<Envelope> => ipcRenderer.invoke('speech:stop'),
  speechTranscribe: (samples: Float32Array): Promise<Envelope<{ text: string }>> =>
    ipcRenderer.invoke('speech:transcribe', samples),

  createTerminal: (spec: { id: string; cwd?: string; command?: string }): Promise<Envelope> =>
    ipcRenderer.invoke('terminal:create', spec),
  writeTerminal: (id: string, data: string): Promise<Envelope> =>
    ipcRenderer.invoke('terminal:write', { id, data }),
  resizeTerminal: (id: string, cols: number, rows: number): Promise<Envelope> =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  terminalScrollback: (id: string): Promise<Envelope<{ scrollback: string }>> =>
    ipcRenderer.invoke('terminal:scrollback', id),
  killTerminal: (id: string): Promise<Envelope> => ipcRenderer.invoke('terminal:kill', id),

  /**
   * Assinatura de canal de evento. O canal decide o payload (`IpcEvents`), e a
   * allowlist de runtime sai da mesma lista — canal errado agora é erro de
   * compilação, e não só um `throw` na hora de assinar.
   */
  on: <C extends IpcChannel>(channel: C, listener: (payload: IpcEvents[C]) => void): (() => void) => {
    if (!IPC_CHANNELS.includes(channel)) throw new Error(`Canal não permitido: ${channel}`)
    const wrapped = (_e: IpcRendererEvent, payload: IpcEvents[C]) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('prime', api)

export type PrimeApi = typeof api
