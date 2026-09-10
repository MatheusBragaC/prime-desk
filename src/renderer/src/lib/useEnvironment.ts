import { useEffect, useSyncExternalStore } from 'react'
import type { EnvStatus, UpdateCheck } from '@shared/protocol'
import { t } from '@/i18n'
import {
  appUserName, checkUpdate, openLoginTerminal, readEnvironment, rescanAgent, runInstall,
  stageFor, unwatchEnvironment, watchEnvironment, type Stage
} from './env'

/**
 * Dono do estado de ambiente/autenticação no renderer.
 *
 * Antes `AccountBadge` e `Onboarding` assinavam o canal `onboarding:env` cada
 * um por si, com estado próprio: dois leitores da mesma verdade e nenhum dono.
 * Aqui vale a mesma regra do destino de execução — quem escreve grava num só
 * lugar, quem exibe observa. O estado vive fora do React (módulo) e chega ao
 * componente por `useSyncExternalStore`; a assinatura do canal é uma só,
 * contada por referência, e some quando o último consumidor desmonta.
 */

interface EnvState {
  status: EnvStatus | null
  /**
   * Origem do último status. O Onboarding distingue "detectado sozinho" de
   * "conferido a pedido" no texto final, e essa é a única diferença entre eles.
   */
  from: 'none' | 'check' | 'watch'
  /** Falha da última checagem; some na checagem seguinte que der certo. */
  error: string | null
  update: UpdateCheck | null
  userName: string
}

let state: EnvState = { status: null, from: 'none', error: null, update: null, userName: '' }

const listeners = new Set<() => void>()

function write(patch: Partial<EnvState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

function snapshot(): EnvState {
  return state
}

let subscribers = 0
let offEnv: (() => void) | null = null

/*
  O watch é global no main: pedir duas vezes não cria dois observadores, mas
  desligar cedo cegaria quem ficou. Daí a contagem de referências.
*/
function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (++subscribers === 1) {
    offEnv = window.prime.on('onboarding:env', (status) => {
      // Guarda de sanidade: payload sem `auth` não descreve ambiente.
      if (status?.auth) write({ status, from: 'watch', error: null })
    })
    watchEnvironment()
  }
  let ativa = true
  return () => {
    // Limpeza chamada duas vezes é garantia de terceiro, não invariante nossa:
    // sem a trava a contagem iria a -1 e a montagem seguinte nunca voltaria a 1
    // — o ambiente ficaria surdo, sem erro nenhum.
    if (!ativa) return
    ativa = false
    listeners.delete(fn)
    if (--subscribers === 0) {
      offEnv?.()
      offEnv = null
      unwatchEnvironment()
    }
  }
}

/** Relê o ambiente sob demanda. Escrita única: todo consumidor vê o resultado. */
export async function refreshEnvironment(): Promise<void> {
  try {
    write({ status: await readEnvironment(), from: 'check', error: null })
  } catch (err) {
    write({ error: err instanceof Error ? err.message : t('onb.checkFailed') })
  }
}

async function refreshUpdate(): Promise<void> {
  // Fora do caminho de boot e sem barulho: falha de rede aqui não é problema
  // do usuário, e a checagem cai calada.
  try {
    write({ update: await checkUpdate() })
  } catch {
    /* sem update conhecido */
  }
}

async function rescanEnvironment(): Promise<void> {
  try {
    write({ status: await rescanAgent(), from: 'check' })
  } catch {
    return
  }
  await refreshUpdate()
}

async function install(): Promise<boolean> {
  write({ error: null })
  const ok = await runInstall()
  if (!ok) {
    write({ error: t('onb.installFailed') })
    return false
  }
  await refreshEnvironment()
  return true
}

export interface Environment extends EnvState {
  /** Estágio derivado do status; `installing` é da tela, não daqui. */
  stage: Exclude<Stage, 'installing'>
  refresh: () => Promise<void>
  install: () => Promise<boolean>
  openTerminal: () => Promise<{ portBusy?: number; error?: string }>
}

/**
 * @param watchUpdates Só o rodapé da conta oferece atualizar. O Onboarding roda
 *                     antes de haver binário instalado, e consultar o npm ali
 *                     seria uma ida à rede sem nada a fazer com a resposta.
 */
export function useEnvironment(watchUpdates = false): Environment {
  const env = useSyncExternalStore(subscribe, snapshot)

  useEffect(() => {
    if (!watchUpdates) return
    void appUserName().then((name) => write({ userName: name }))
    void refreshUpdate()
  }, [watchUpdates])

  /*
    Fim de uma aba de terminal com atualização pendente: redescobre o binário e
    relê o ambiente. Não dá para saber qual aba fechou, mas o rescan é barato e
    idempotente, e só roda quando havia update para fazer.
  */
  const pendingUpdate = watchUpdates && Boolean(env.update?.available)
  useEffect(() => {
    if (!pendingUpdate) return
    const off = window.prime.on('terminal:exit', () => void rescanEnvironment())
    return () => {
      off()
    }
  }, [pendingUpdate])

  return {
    ...env,
    stage: stageFor(env.status),
    refresh: refreshEnvironment,
    install,
    openTerminal: openLoginTerminal
  }
}
