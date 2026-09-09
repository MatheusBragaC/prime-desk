import { useCallback, useState } from 'react'
import type { SshConnection } from '../../../shared/protocol'
import type { SshForm } from './types'
import { useAgent, refreshSessions } from '../store/agent'
import { restartBridge, fallbackToLocal } from './useBridge'
import { useT } from '../i18n'

/**
 * Onde o agente roda: diretório local ou máquina remota por SSH.
 *
 * O catálogo de conexões é persistido pelo main, e a fonte da verdade é sempre
 * o que ele devolve depois de salvar — não a lista que mandamos. Assim o disco e
 * a tela não divergem se o main normalizar ou recusar alguma entrada.
 *
 * Se o destino escolhido não sobe, a ponte volta para o local: ficar sem ponte
 * nenhuma deixaria a janela viva mas inerte, sem explicação.
 */

export interface ExecutionTarget {
  connections: SshConnection[]
  /** Carrega o catálogo do disco. Chamado quando o boot termina. */
  load: () => Promise<void>
  add: (form: SshForm) => Promise<void>
  remove: (id: string) => Promise<void>
  /** `null` volta para o local. */
  use: (conn: SshConnection | null) => Promise<void>
  /** Abre o seletor de diretório e sobe a ponte lá. */
  pickDirectory: () => Promise<void>
}

export function useExecutionTarget(): ExecutionTarget {
  const { t } = useT()
  const [connections, setConnections] = useState<SshConnection[]>([])

  const load = useCallback(async () => {
    const res = await window.prime.listSshConnections()
    if (res.ok) setConnections(res.connections)
  }, [])

  const persist = useCallback(async (list: SshConnection[]) => {
    const r = await window.prime.saveSshConnections(list)
    if (r.ok) setConnections(r.connections)
  }, [])

  const use = useCallback(
    async (conn: SshConnection | null) => {
      const store = useAgent.getState()
      const cwd = store.cwd

      const r = await restartBridge({
        cwd,
        ssh: conn ? (conn.remotePath ? `${conn.host}:${conn.remotePath}` : conn.host) : undefined,
        sshPort: conn?.port,
        sshIdentity: conn?.identity
      })

      if (!r.ok) {
        store.setStatus('error')
        store.notify('error', r.error ?? 'Não foi possível iniciar nesse destino.')
        await fallbackToLocal(cwd)
        return
      }

      store.notify('info', conn ? t('exec.runningOn', { name: conn.name }) : t('exec.runningLocal'))
    },
    [t]
  )

  const add = useCallback(
    async (form: SshForm) => {
      const conn: SshConnection = {
        id: 'c' + Date.now().toString(36),
        name: form.name,
        host: form.host.trim(),
        port: form.port ? Number(form.port) : undefined,
        identity: form.identity.trim() || undefined,
        remotePath: form.remotePath.trim() || undefined
      }
      await persist([...connections, conn])
      await use(conn)
    },
    [connections, persist, use]
  )

  const remove = useCallback(
    async (id: string) => {
      await persist(connections.filter((x) => x.id !== id))
    },
    [connections, persist]
  )

  const pickDirectory = useCallback(async () => {
    const picked = await window.prime.pickDirectory()
    if (!picked?.ok) return

    const previous = useAgent.getState().cwd
    const r = await restartBridge({ cwd: picked.path }, (cwd) => {
      useAgent.getState().setCwd(cwd ?? picked.path)
    })

    /*
      Antes esta falha era ignorada: o código nem olhava o retorno do
      `startBridge`, marcava a sessão como pronta e mostrava o diretório novo no
      chip. A janela ficava viva e inerte, apontando para um lugar onde não
      havia ponte. Agora avisa e volta para o diretório anterior.
    */
    if (!r.ok) {
      const store = useAgent.getState()
      store.setStatus('error')
      store.notify('error', r.error ?? t('exec.cantStartHere'))
      store.setCwd(previous)
      await fallbackToLocal(previous)
      return
    }

    void refreshSessions()
  }, [t])

  return { connections, load, add, remove, use, pickDirectory }
}
