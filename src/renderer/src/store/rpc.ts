import type { RpcResponse } from '@shared/protocol'

/*
  Transporte puro: fala com o preload e devolve o erro em vez de engoli-lo.

  Não importa o store de propósito — é a fatia que todas as outras podem usar
  sem criar ciclo de módulo.
*/

/*
  Exportada porque as outras fatias chamam canais do preload diretamente
  (`fire`, `transcript`, `listSessions`). Continua sendo função, e não
  constante, porque `window.prime` só existe depois do preload.
*/
export const bridge = () => window.prime

export interface RpcOutcome<T> {
  ok: boolean
  data: T | null
  error?: string
}

/** Chamada crua: devolve o erro em vez de engolir. */
export async function rpcCall<T = unknown>(
  type: string,
  payload?: Record<string, unknown>
): Promise<RpcOutcome<T>> {
  const r = await bridge().send(type, payload)
  if (!r?.ok) return { ok: false, data: null, error: r?.error ?? 'Falha de transporte.' }
  const res = r.res as RpcResponse<T>
  if (!res.success) return { ok: false, data: null, error: res.error ?? `Comando "${type}" falhou.` }
  return { ok: true, data: (res.data ?? null) as T | null }
}

export async function rpc<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T | null> {
  const out = await rpcCall<T>(type, payload)
  if (!out.ok) console.warn('[rpc]', type, out.error)
  return out.data
}
