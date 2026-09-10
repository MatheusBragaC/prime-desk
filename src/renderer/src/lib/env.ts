import type { EnvStatus, UpdateCheck } from '../../../shared/protocol'
import { t } from '../i18n'
import { unwrap } from './ipc'

/**
 * Ambiente do prime-agent: binário instalado e credencial válida.
 *
 * Este módulo é a única porta para os comandos de ambiente/autenticação. Antes
 * `AccountBadge` e `Onboarding` chamavam `window.prime` direto — vinte chamadas
 * cruas, cada uma tratando `{ ok, error }` a seu modo, e a mesma derivação de
 * estágio escrita três vezes. O dado tem dono no `useEnvironment`; aqui ficam
 * as chamadas e as funções puras que a tela usa para rotular.
 */

/** `installing` é passo da tela, não do ambiente: só o Onboarding o produz. */
export type Stage = 'checking' | 'install' | 'installing' | 'auth' | 'ready'

/**
 * Estágio derivado do ambiente.
 *
 * `null` é "ainda não sei", não "nada instalado": sem isso a tela piscaria
 * "instalar" antes da primeira checagem responder.
 */
export function stageFor(status: EnvStatus | null): Exclude<Stage, 'installing'> {
  if (!status) return 'checking'
  if (!status.agent.installed) return 'install'
  if (!status.auth.ok) return 'auth'
  return 'ready'
}

/**
 * Rótulo da origem da credencial.
 *
 * A variável de ambiente entra sem o sufixo `_API_KEY`, que é ruído de shell e
 * não diz nada a quem lê o menu.
 */
export function providerLabel(provider: string | null, envKey: string | null): string | null {
  if (provider) return provider
  if (envKey) return envKey.replace('_API_KEY', '').toLowerCase()
  return null
}

/** Segunda linha do passo "agente instalado". */
export function agentDetail(status: EnvStatus | null, checking: boolean): string {
  if (status?.agent.version) {
    return `${t('onb.version')} ${status.agent.version} · ${status.agent.path}`
  }
  return checking ? t('onb.checking') : t('onb.notFound')
}

/** Segunda linha do passo "autenticado". */
export function authDetail(status: EnvStatus | null, checking: boolean): string {
  if (status?.auth.providers.length) return `auth.json: ${status.auth.providers.join(', ')}`
  if (status?.auth.envKeys.length) {
    return `${t('onb.envVar')}: ${status.auth.envKeys.join(', ')}`
  }
  return checking ? t('onb.checking') : t('onb.noCreds')
}

// ------------------------------------------------------------------ comandos

export function readEnvironment(): Promise<EnvStatus> {
  return unwrap(window.prime.checkEnvironment(), (r) => r.status, t('onb.checkFailed'))
}

/**
 * Redescobre o binário depois de uma atualização.
 *
 * Troca de versão não mexe no `auth.json`, então o watch do main não dispara e
 * o caminho memorizado pode ter mudado de prefixo.
 */
export function rescanAgent(): Promise<EnvStatus> {
  return unwrap(window.prime.rescanAgent(), (r) => r.status, t('onb.checkFailed'))
}

export function installCommand(): Promise<string> {
  return unwrap(window.prime.installCommand(), (r) => r.command, t('onb.installFailed'))
}

/** Fora do envelope: o main devolve `{ ok, code }` e o código não é usado aqui. */
export async function runInstall(): Promise<boolean> {
  const r = await window.prime.installAgent()
  return Boolean(r?.ok)
}

export function checkUpdate(): Promise<UpdateCheck> {
  return unwrap(window.prime.checkAgentUpdate(), (r) => r.update, t('onb.checkFailed'))
}

export async function logoutProvider(provider: string): Promise<void> {
  const r = await window.prime.logoutProvider(provider)
  if (!r?.ok) throw new Error(r?.error ?? t('acct.signOutFailed'))
}

/** Nome de exibição da pessoa, do sistema operacional. */
export async function appUserName(): Promise<string> {
  const info = await window.prime.appInfo()
  return info.userName
}

/**
 * Abre o terminal externo para o `/login`.
 *
 * Um login pendente em outra janela prende a porta do callback e faz o TUI
 * ignorar o Enter sem dizer nada — por isso a porta é conferida antes.
 */
export async function openLoginTerminal(): Promise<{ portBusy?: number; error?: string }> {
  const port = await window.prime.checkLoginPort()
  if (port && !port.free) return { portBusy: port.port }
  const r = await window.prime.openAgentTerminal()
  if (!r?.ok) return { error: r?.error ?? t('onb.termOpenFailed') }
  return {}
}

export function watchEnvironment(): void {
  void window.prime.watchEnvironment()
}

export function unwatchEnvironment(): void {
  void window.prime.unwatchEnvironment()
}
