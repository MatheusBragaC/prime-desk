import { useEffect, useState } from 'react'
import {
  useAgent, refreshModels, refreshCommands, refreshSessions,
  refreshFolders, maybeGenerateTitle, waitForState
} from '../store/agent'
import { useT } from '../i18n'

/**
 * Ciclo de vida da ponte com o prime-agent: ouvintes do main e boot.
 *
 * Roda uma vez, no nível mais estável da árvore. Não pode virar vários efeitos
 * menores: os ouvintes têm de estar registrados **antes** do `startBridge`,
 * senão os primeiros eventos do worker chegam sem ninguém escutando.
 *
 * O `t` é capturado na montagem de propósito — as mensagens daqui são de falha
 * de infraestrutura, e reinscrever os ouvintes a cada troca de idioma perderia
 * eventos no meio de um turno.
 */

export interface BridgeBoot {
  /** `null` enquanto o ambiente não foi checado; `true` chama o onboarding. */
  needsSetup: boolean | null
  setNeedsSetup: (v: boolean) => void
  /** `$HOME` do lado onde o agente roda. Vazio até o boot responder. */
  home: string
}

export function useBridge(onReady: () => void): BridgeBoot {
  const { t } = useT()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [home, setHome] = useState('')

  useEffect(() => {
    const store = useAgent.getState()

    const offEvent = window.prime.on('agent:event', (ev) => {
      /*
        Evento de ponte estacionada: aquele turno continua rodando fora da tela e
        não pode escrever na conversa que está aberta. O aviso de término chega
        pelo canal `bridge:run-ended`.
      */
      const activeBridge = useAgent.getState().activeBridgeId
      if (ev.bridgeId && activeBridge && ev.bridgeId !== activeBridge) return

      // Eventos de sessões observadas vêm embrulhados para não se confundirem
      // com os da sessão própria. Roteia para o namespace do observado.
      if (ev.type === 'observed_session_event' && ev.activeSessionId && ev.event) {
        store.ingestObserved(ev.activeSessionId, ev.event)
        return
      }
      if (ev.type === 'observed_session_closed' && ev.activeSessionId) {
        store.upsertObserved(ev.activeSessionId, {
          status: ev.error ? 'error' : 'closed',
          error: ev.error
        })
        return
      }

      store.ingest(ev)

      // A sessão só entra no catálogo quando ganha a primeira mensagem; sem
      // isto a conversa recém-criada ficaria invisível até um refresh manual.
      if (ev.type === 'agent_end') {
        void refreshSessions()
        void maybeGenerateTitle()
      }
    })
    const offParked = window.prime.on('bridge:parked', (runs) => store.setParkedRuns(runs))
    const offEnded = window.prime.on('bridge:run-ended', (info) => {
      const title = useAgent.getState().sessions.find((x) => x.path === info.sessionPath)?.title
      store.notify('info', t('session.runFinished', { name: title ?? '' }).trim())
      void refreshSessions()
    })
    const offErr = window.prime.on('agent:stderr', (chunk) => store.applyStderr(chunk))
    const offFatal = window.prime.on('agent:fatal', (msg) => store.setFatal(msg))
    const offTree = window.prime.on('agents:tree', (tree) => store.setTree(tree))
    const offTreeErr = window.prime.on('agents:tree-error', (msg) => store.setTreeError(msg))
    const offExit = window.prime.on('agent:exit', (info) => {
      if (info?.expected) {
        store.setStatus('stopped')
      } else {
        store.setFatal(
          t('bridge.exited', { code: info?.code ?? '?' }) + '\n' + (info?.stderr ?? '').slice(-600)
        )
      }
    })

    async function boot(): Promise<void> {
      store.setStatus('starting')
      const info = await window.prime.appInfo()
      setHome(info.home)
      store.setPlatform(info.platform)

      // Ambiente incompleto: onboarding assume a tela antes de tentar a ponte.
      const env = await window.prime.checkEnvironment()
      const ready = env.ok && env.status.agent.installed && env.status.auth.ok
      setNeedsSetup(!ready)
      if (!ready) return

      const r = await window.prime.startBridge({ cwd: info.home })
      if (!r.ok) {
        store.setFatal(t('bridge.cantStart'))
        return
      }
      // O cwd efetivo vem do main, não do que pedimos: se a ponte já estava de
      // pé (recarga do renderer), o diretório real é o dela.
      store.setCwd(r.cwd ?? info.home)
      store.setExecution(r.execution)
      store.setActiveBridge(r.bridgeId ?? null)

      if (!(await waitForState())) {
        store.setFatal(t('bridge.noState'))
        return
      }

      store.setStatus('ready')
      void refreshModels()
      void refreshCommands()
      void refreshSessions()
      void refreshFolders()
      onReady()
    }

    void boot()

    return () => {
      offEvent()
      offParked()
      offEnded()
      offErr()
      offFatal()
      offExit()
      offTree()
      offTreeErr()
      void window.prime.stopBridge()
    }
    // Uma vez só: ver o comentário do topo.
  }, [])

  return { needsSetup, setNeedsSetup, home }
}

/**
 * Sobe a ponte em outro lugar — outro diretório, ou outra máquina por SSH.
 *
 * Trocar de destino é derrubar e subir de novo: o worker do daemon carrega um
 * cwd por vez. `reset()` limpa a conversa na tela antes, senão o transcript da
 * anterior ficaria sob o estado da nova.
 *
 * `onStarted` roda depois do start e **antes** da espera pelo worker. A ordem
 * importa: são alguns segundos de espera, e quem precisa mostrar o diretório
 * novo no chip do composer não pode ficar com o antigo nesse intervalo.
 */
export async function restartBridge(
  opts: Parameters<typeof window.prime.startBridge>[0],
  onStarted?: (cwd: string | undefined) => void
): Promise<{ ok: boolean; error?: string }> {
  const store = useAgent.getState()
  store.setStatus('starting')
  store.reset()
  await window.prime.stopBridge()

  const r = await window.prime.startBridge(opts)
  if (!r.ok) return { ok: false, error: r.error }

  /*
    O destino efetivo é o que o main devolve, não o que pedimos: ele recusa SSH
    sem conexão correspondente e cai para local. Escrever aqui é o que faz o
    chip do composer mudar na hora, sem esperar troca de diretório.
  */
  store.setExecution(r.execution)
  store.setActiveBridge(r.bridgeId ?? null)
  onStarted?.(r.cwd)

  // Sem checar o retorno, como antes: aqui a ponte já subiu, e um worker lento
  // não é motivo para declarar a troca de destino como falha.
  await waitForState()
  store.setStatus('ready')
  return { ok: true }
}

/** Usado quando o destino escolhido falha e é preciso voltar para o local. */
export async function fallbackToLocal(cwd: string): Promise<void> {
  const back = await window.prime.startBridge({ cwd })
  const store = useAgent.getState()
  store.setActiveBridge(back.ok ? back.bridgeId : null)
  if (back.ok) store.setExecution(back.execution)
}
