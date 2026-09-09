import type { Envelope, Ok } from '../../../shared/protocol'

/**
 * Adaptador entre o envelope do IPC e código que espera exceção.
 *
 * Todo handler do main devolve `{ ok, ...dados, error? }` em vez de lançar —
 * decisão deliberada, para que uma falha no processo principal não vire
 * `invoke` rejeitado sem mensagem. O preço é que cada chamador repete
 * `if (!r.ok) …`, e nenhum hook genérico de carga fica limpo.
 *
 * `unwrap` traduz: envelope recusado vira `Error` com a mensagem do main.
 *
 * @param call     A promessa do `window.prime.*`.
 * @param pick     Extrai o dado útil do envelope, já no ramo bem-sucedido: não
 *                 há mais cast aqui, o preload declara o tipo de cada método.
 * @param fallback Mensagem quando o main recusa sem dizer o motivo — acontece
 *                 em vários handlers que só devolvem `{ ok: false }`.
 */
export async function unwrap<T, D>(
  call: Promise<Envelope<T>>,
  pick: (res: Ok<T>) => D,
  fallback: string
): Promise<D> {
  const res = await call
  if (!res.ok) throw new Error(res.error ?? fallback)
  return pick(res)
}
