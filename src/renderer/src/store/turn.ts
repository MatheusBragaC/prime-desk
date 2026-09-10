import type { DeliveryBehavior, QueueMode, ThinkingLevel } from '@shared/protocol'
import { useAgent, refreshState } from './agentStore'
import { bridge, rpc, rpcCall } from './rpc'
import { maybeGenerateTitle } from './titles'
import { t } from '@/i18n'

/* O turno: enviar prompt, abortar e os ajustes que valem para o turno seguinte. */

/**
 * Envia um prompt. Devolve `false` quando o agente recusou.
 *
 * `streamingBehavior` vai SEMPRE, e isso é correção de bug. O agente exige o
 * campo em qualquer estado com trabalho enfileirado — não só streaming, mas
 * também compactando ou com bash rodando, quando `isStreaming` é `false`
 * (`core/agent-session.js`: "Specify streamingBehavior ... to queue the
 * message"). Sem o campo o send era recusado, o erro morria num `console.warn`
 * e o composer já havia limpado o texto: a mensagem da pessoa sumia sem aviso.
 *
 * O retorno existe pelo mesmo motivo — quem chama só pode limpar a caixa
 * depois de saber que foi aceito.
 */
export async function sendPrompt(
  message: string,
  images?: { data: string; mimeType: string }[],
  behavior: DeliveryBehavior = 'steer'
): Promise<boolean> {
  const payload: Record<string, unknown> = { message, streamingBehavior: behavior }
  if (images?.length) payload.images = images.map((i) => ({ type: 'image', ...i }))

  const out = await rpcCall('prompt', payload)
  if (!out.ok) {
    useAgent.getState().notify('error', out.error ?? t('composer.sendFailed'))
    return false
  }
  void refreshState()

  /*
    O título nasce junto com o primeiro prompt, em paralelo ao turno. Esperar o
    `agent_end` significava ver "Nova conversa" na sidebar durante todo o tempo
    de resposta — que numa tarefa longa são minutos. O assunto já está na
    primeira mensagem; a resposta raramente muda o nome.
  */
  void maybeGenerateTitle()
  return true
}

/**
 * Aborta o turno em andamento.
 *
 * NÃO limpa a fila: o que estiver enfileirado roda em seguida. Limpar exigiria
 * `abort_and_clear_queue`, que só existe no protocolo interno do daemon e não
 * está no RPC. A UI precisa dizer isso, senão o botão promete o que não faz.
 */
export async function abortTurn(): Promise<void> {
  await bridge().fire('abort')
  void refreshState()
}

export async function setSteeringMode(mode: QueueMode): Promise<void> {
  await rpc('set_steering_mode', { mode })
  void refreshState()
}

export async function setFollowUpMode(mode: QueueMode): Promise<void> {
  await rpc('set_follow_up_mode', { mode })
  void refreshState()
}

/**
 * Troca o modelo ativo.
 *
 * O RPC do prime-agent exige `provider` e `modelId` como campos separados
 * (`docs/rpc.md`: `{"type":"set_model","provider":"anthropic","modelId":"..."}`)
 * — nunca existiu um campo `model` só. A primeira versão da GUI mandava
 * `{ model: id }`, que o daemon rejeitava com "Model not found" a cada troca;
 * o erro só ia para o console, então a interface simplesmente não reagia.
 */
export async function setModel(provider: string, id: string): Promise<void> {
  const out = await rpcCall('set_model', { provider, modelId: id })
  if (!out.ok) {
    useAgent.getState().notify('error', out.error ?? t('model.switchFailed'))
    return
  }
  void refreshState()
}

export async function setThinking(level: ThinkingLevel): Promise<void> {
  await rpc('set_thinking_level', { level })
  void refreshState()
}

export async function compactNow(): Promise<void> {
  await rpc('compact')
}
