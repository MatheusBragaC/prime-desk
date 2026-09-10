import type { FolderState, ModelInfo } from '../../../shared/protocol'
import { useAgent, type CommandInfo } from './agentStore'
import { bridge, rpc } from './rpc'

/*
  Catálogos que a sidebar e os seletores mostram: modelos, comandos, sessões,
  árvore de agentes e pastas. Tudo vem do agente ou do main; nada é calculado
  aqui.
*/

export async function refreshModels(): Promise<void> {
  const data = await rpc<{ models: ModelInfo[] } | ModelInfo[]>('get_available_models')
  if (!data) return
  const models = Array.isArray(data) ? data : data.models
  if (models) useAgent.getState().setModels(models)
}

export async function refreshCommands(): Promise<void> {
  const data = await rpc<{ commands: CommandInfo[] }>('get_commands')
  if (data?.commands) useAgent.getState().setCommands(data.commands)
}

export async function refreshSessions(): Promise<void> {
  const r = await bridge().listSessions()
  if (r.ok) useAgent.getState().setSessions(r.sessions)

  /*
    Um ciclo da árvore junto com o catálogo. Com o poller desligado em repouso, é
    isto que mantém fresca a marca de "carregada em outro worker" na sidebar —
    exatamente nos momentos em que ela importa: abrir, criar ou renomear conversa.
  */
  void bridge().refreshAgentTree()
}

/**
 * Pede um ciclo da árvore de agentes agora.
 *
 * O main empurra o resultado por `agents:tree`, o mesmo canal do poller — então
 * quem chama não precisa do retorno. Serve para telas que aparecem fora do
 * ritmo do poller, que fica desligado quando nada roda.
 */
export async function refreshTree(): Promise<void> {
  await bridge().refreshAgentTree()
}

export async function refreshFolders(): Promise<void> {
  const r = await bridge().loadFolders()
  if (r.ok) useAgent.getState().setFolders(r.state)
}

/** Atualiza pastas de forma otimista; o main sanitiza e devolve a verdade final. */
export async function mutateFolders(fn: (state: FolderState) => FolderState): Promise<void> {
  const next = fn(useAgent.getState().folders)
  useAgent.getState().setFolders(next)
  const r = await bridge().saveFolders(next)
  if (r.ok) useAgent.getState().setFolders(r.state)
}
