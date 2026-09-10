import type { AgentMessage } from '@shared/protocol'
import { useAgent, refreshState } from './agentStore'
import { bridge, rpc, rpcCall } from './rpc'
import { refreshSessions } from './catalog'
import { t } from '@/i18n'

/*
  Ciclo de vida da conversa e da ponte: criar, abrir, estacionar, readotar,
  reiniciar em outro diretório, carregar a cauda do transcript e excluir.

  É a fatia mais densa porque abrir uma conversa tem três caminhos (ponte
  estacionada, estacionar a atual, troca simples) e todos terminam no mesmo
  carregamento.
*/

export async function newSession(): Promise<void> {
  if (confirmInterrupt(() => newSessionNow(), t('session.newWhileRunning'))) return
  await newSessionNow()
}

async function newSessionNow(): Promise<void> {
  await rpc('new_session')
  useAgent.getState().reset()
  void refreshState()
  void refreshSessions()
}

/**
 * Abre uma sessão salva.
 *
 * `switch_session` recebe **sessionPath**, não sessionId — mandar o campo errado
 * faz o comando falhar em silêncio e a seleção nunca sai do lugar.
 */
/**
 * Encerra o turno em andamento antes de mexer na sessão do worker.
 *
 * Medido: `switch_session` durante o streaming corta a execução **sem emitir
 * `agent_end`** — o cliente fica sem fechamento e a interface acha que ainda
 * está transmitindo. Abortar antes torna o fim determinístico.
 */
async function stopRunBeforeSwitch(): Promise<void> {
  await bridge().fire('abort')
  await new Promise((r) => setTimeout(r, 700))
  await refreshState()
}

/**
 * Pede confirmação quando há execução em andamento.
 *
 * O worker do daemon carrega uma sessão por vez: trocar substitui o runtime e
 * interrompe o que roda. Isso não pode acontecer por acidente.
 */
function confirmInterrupt(onProceed: () => void | Promise<void>, extra?: string): boolean {
  const store = useAgent.getState()
  if (!store.state?.isStreaming) return false

  store.requestConfirm({
    title: t('session.busyRunTitle'),
    message: t('session.busyRunMsg') + (extra ? ` ${extra}` : ''),
    detail: t('session.busyRunDetail'),
    confirmLabel: t('session.busyRunConfirm'),
    danger: true,
    onConfirm: async () => {
      await stopRunBeforeSwitch()
      await onProceed()
    }
  })
  return true
}

/**
 * Abre uma conversa sem matar o que está rodando.
 *
 * Três caminhos, nesta ordem:
 *
 * 1. A conversa de destino já está numa ponte estacionada (é um turno que
 *    continuou em segundo plano): readota aquela ponte.
 * 2. A ponte atual está executando: estaciona — o turno segue até o fim e o
 *    renderer é avisado — e uma ponte nova sobe para o destino.
 * 3. Nada rodando: caminho normal, a mesma ponte troca de sessão.
 *
 * Se estacionar falhar, cai no comportamento antigo: confirmar e abortar. É
 * melhor perguntar do que perder um turno em silêncio.
 */
export async function openSession(sessionPath: string): Promise<void> {
  const store = useAgent.getState()

  const parked = store.parkedRuns.find((r) => r.sessionPath === sessionPath)
  if (parked) {
    await adoptParked(parked.id, sessionPath)
    return
  }

  if (store.state?.isStreaming) {
    const parkedOk = await parkCurrentRun()
    if (parkedOk) {
      await openSessionNow(sessionPath)
      return
    }
    if (confirmInterrupt(() => openSessionNow(sessionPath))) return
  }

  await openSessionNow(sessionPath)
}

/**
 * Estaciona a ponte que está executando e sobe outra no lugar.
 *
 * Estacionar deixa o app **sem ponte ativa** — não há para onde mandar
 * `switch_session`. Por isso a substituta sobe aqui mesmo, antes de qualquer
 * outra coisa. `false` devolve o fluxo ao caminho antigo (confirmar e abortar).
 */
async function parkCurrentRun(): Promise<boolean> {
  const store = useAgent.getState()
  const r = await window.prime.parkBridge()
  if (!r?.ok) return false

  store.setActiveBridge(null)
  // A conversa estacionada sai da tela; o palco é limpo para a próxima.
  store.reset()
  // A tela não pode continuar em "executando": aquele turno é de outra ponte.
  if (store.state) store.setState({ ...store.state, isStreaming: false })

  const up = await startBridgeAt(store.cwd)
  if (!up) return false

  store.notify('info', t('session.parked'))
  return true
}

/** Volta para uma conversa que continuou rodando em segundo plano. */
async function adoptParked(id: string, sessionPath: string): Promise<void> {
  const store = useAgent.getState()
  store.setLoadingSession(true)
  try {
    if (store.state?.isStreaming) await parkCurrentRun()

    const r = await window.prime.adoptBridge(id)
    if (!r?.ok) {
      // Terminou entre o clique e a adoção: abre pelo caminho normal.
      await openSessionNow(sessionPath)
      return
    }

    store.reset()
    store.setActiveBridge(r.bridgeId)
    store.setCwd(r.cwd)
    store.setExecution(r.execution)
    await loadTranscript(sessionPath, store)
    await refreshState()
    void refreshSessions()
  } finally {
    useAgent.getState().setLoadingSession(false)
  }
}

async function openSessionNow(sessionPath: string): Promise<void> {
  const store = useAgent.getState()
  store.setLoadingSession(true)
  try {
    await switchAndLoad(sessionPath, store)
  } finally {
    useAgent.getState().setLoadingSession(false)
  }
}

/**
 * Reabre a ponte em outro diretório e espera o agente responder.
 *
 * `bridge:start` recusa um `cwd` novo com a ponte de pé — o diretório do
 * processo é a verdade e não pode divergir do que a interface mostra. Trocar de
 * diretório é, por construção, reiniciar.
 */
/**
 * Sobe uma ponte nova em `cwd` e espera o agente responder.
 *
 * `bridge:stop` emite `agent:exit` esperado, que põe o status em "parado". Sem
 * marcar o reinício, a barra dizia "Desconectado" com a ponte já de pé e o
 * composer travava em "Conectando ao agente…".
 */
async function startBridgeAt(cwd: string): Promise<boolean> {
  const store = useAgent.getState()
  store.setStatus('starting')

  const r = await window.prime.startBridge({ cwd })
  if (!r?.ok) {
    store.notify('error', r?.error ?? t('session.cwdFailed'))
    store.setStatus('error')
    return false
  }
  store.setCwd(r.cwd ?? cwd)
  store.setExecution(r.execution)
  store.setActiveBridge(r.bridgeId ?? null)

  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 250))
    await refreshState()
    if (useAgent.getState().state) {
      useAgent.getState().setStatus('ready')
      return true
    }
  }
  store.setStatus('error')
  return false
}

/** Fecha a ponte ativa e reabre em outro diretório. */
async function restartBridgeAt(cwd: string): Promise<boolean> {
  await window.prime.stopBridge()
  return startBridgeAt(cwd)
}

/**
 * O diretório de trabalho pertence à conversa, não ao app.
 *
 * Cada sessão grava no cabeçalho o `cwd` em que foi criada. Sem reconciliar isso
 * na troca, abrir a conversa de um repositório e voltar para outra deixava o
 * agente executando `bash` e `edit` na pasta errada — e os chips acima do
 * composer mostrando um repositório que não era o daquela conversa.
 *
 * Só vale para execução local: no SSH, o destino é montado com porta e chave que
 * não estão no catálogo de sessões, e reiniciar às cegas derrubaria a conexão.
 */
async function syncCwdToSession(sessionPath: string): Promise<void> {
  const store = useAgent.getState()
  const summary = store.sessions.find((s) => s.path === sessionPath)
  const target = summary?.cwd?.trim()
  if (!target || target === store.cwd) return

  if (store.execution.kind === 'ssh') return

  await restartBridgeAt(target)
}

async function switchAndLoad(
  sessionPath: string,
  store: ReturnType<typeof useAgent.getState>
): Promise<void> {
  // Antes de carregar: a ponte precisa estar no diretório daquela conversa.
  await syncCwdToSession(sessionPath)

  const out = await rpcCall<{ cancelled?: boolean }>('switch_session', { sessionPath })

  if (!out.ok) {
    /*
      O daemon recusa abrir uma sessão que outro worker mantém carregada. Isso é
      comum depois de fechar o terminal: fechar o TUI só desconecta o cliente, o
      worker continua residente. Em vez de só informar, oferecemos encerrá-lo.
    */
    const busy = (out.error ?? '').match(/already active in ([A-Za-z0-9_-]+)/i)
    if (busy) {
      store.requestConfirm({
        title: t('session.busyTitle'),
        message: t('session.busyMsg'),
        detail: t('session.busyWarn'),
        confirmLabel: t('session.busyConfirm'),
        danger: true,
        onConfirm: async () => {
          const stopped = await bridge().stopAgent(busy[1])
          if (!stopped?.ok) {
            store.notify('error', stopped?.error ?? t('session.stopFailed'))
            return
          }
          // O worker leva um instante para soltar o arquivo.
          await new Promise((r) => setTimeout(r, 1200))
          await openSession(sessionPath)
        }
      })
      return
    }

    store.notify('error', out.error ?? t('session.openFailed'))
    return
  }
  if (out.data?.cancelled) {
    store.notify('info', t('session.switchCancelled'))
    return
  }

  store.reset()
  // Carimba a sessão na ponte: é assim que ela se reconhece depois de estacionada.
  void window.prime.markBridge({ sessionPath })

  await loadTranscript(sessionPath, store)

  await refreshState()
  void refreshSessions()
}

/**
 * Carrega a cauda da conversa.
 *
 * Histórico vem do arquivo, não de `get_messages`: medido numa sessão de 13 MB,
 * o RPC levava 6 s e trafegava 12,5 MB para devolver a conversa inteira. Aqui
 * lemos só a cauda, que é o que a tela mostra. O RPC continua como reserva.
 */
async function loadTranscript(
  sessionPath: string,
  store: ReturnType<typeof useAgent.getState>
): Promise<void> {
  const tail = await bridge().transcript(sessionPath, 400)
  if (tail?.ok) {
    const entries = tail.entries as { type?: string; message?: AgentMessage }[]
    const messages = entries
      .filter((e) => e.type === 'message' && e.message)
      .map((e) => e.message as AgentMessage)
    store.loadHistory(messages)
  } else {
    const data = await rpc<{ messages: AgentMessage[] }>('get_messages')
    if (data?.messages) store.loadHistory(data.messages)
  }
}

/**
 * Exclui o arquivo de uma conversa.
 *
 * Se ela for a que está aberta, o worker ainda a mantém carregada — por isso
 * trocamos para uma sessão nova antes de apagar. Sem isso, excluir a conversa
 * atual não funcionava.
 */
export async function deleteSession(sessionId: string, path: string): Promise<boolean> {
  const store = useAgent.getState()
  const isActive = store.state?.sessionId === sessionId

  if (isActive) {
    await rpc('new_session')
    store.reset()
    await refreshState()
  }

  const r = await bridge().deleteSession(path)
  if (!r?.ok) {
    store.notify('error', r?.error ?? t('delete.failed'))
    return false
  }

  store.notify('info', t('delete.done'))
  void refreshSessions()
  return true
}
