/*
  Casca de `lib/env.ts`: registra watch/unwatch — que é sobre o que a suíte
  afirma — e devolve ambiente pronto no lugar de ir ao IPC.
*/
export const watchCalls: string[] = []

export function watchEnvironment(): void {
  watchCalls.push('watch')
}
export function unwatchEnvironment(): void {
  watchCalls.push('unwatch')
}

export type Stage = 'checking' | 'install' | 'installing' | 'auth' | 'ready'
export const stageFor = (status: unknown): Exclude<Stage, 'installing'> =>
  status ? 'ready' : 'checking'

const pronto = {
  agent: { installed: true, path: '/usr/bin/prime-agent', version: '1.0.0' },
  auth: { ok: true, providers: ['anthropic'], envKeys: [] }
}

export async function readEnvironment(): Promise<unknown> {
  return pronto
}
export async function rescanAgent(): Promise<unknown> {
  return pronto
}
export async function checkUpdate(): Promise<unknown> {
  return { available: false }
}
export async function runInstall(): Promise<boolean> {
  return true
}
export async function appIdentity(): Promise<{ userName: string; version: string }> {
  return { userName: 'dev', version: '9.9.9' }
}
export async function openLoginTerminal(): Promise<Record<string, never>> {
  return {}
}
