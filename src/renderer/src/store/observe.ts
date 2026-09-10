import type { AgentMessage } from '@shared/protocol'
import { useAgent } from './agentStore'
import { bridge, rpc } from './rpc'
import { hydrate } from './transcript'
import { t } from '@/i18n'

/**
 * Assina os eventos de outra sessão (root ou subagente).
 *
 * A resposta de `observe` já traz o histórico; os eventos seguintes chegam
 * embrulhados em `observed_session_event` e são bufferizados pelo agente até a
 * resposta ser entregue, então não há janela de perda.
 */
export async function observeSession(activeSessionId: string, name: string): Promise<void> {
  const store = useAgent.getState()
  store.upsertObserved(activeSessionId, { name, status: 'loading' })

  const data = await rpc<{ messages: AgentMessage[] }>('observe', { activeSessionId })
  if (!data) {
    store.upsertObserved(activeSessionId, {
      status: 'error',
      error: t('observed.failed')
    })
    return
  }
  store.upsertObserved(activeSessionId, {
    transcript: hydrate(data.messages ?? []),
    status: 'live',
    lastEventAt: Date.now()
  })
}

export async function unobserveSession(activeSessionId: string): Promise<void> {
  await bridge().fire('unobserve', { activeSessionId })
  useAgent.getState().dropObserved(activeSessionId)
}
