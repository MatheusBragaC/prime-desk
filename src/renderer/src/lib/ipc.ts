/**
 * Adaptador entre o envelope do IPC e código que espera exceção.
 *
 * Todo handler do main devolve `{ ok, ...dados, error? }` em vez de lançar —
 * decisão deliberada, para que uma falha no processo principal não vire
 * `invoke` rejeitado sem mensagem. O preço é que cada chamador repete
 * `if (!r?.ok) …`, e nenhum hook genérico de carga fica limpo.
 *
 * `unwrap` traduz: envelope recusado vira `Error` com a mensagem do main.
 *
 * @param call     A promessa do `window.prime.*`.
 * @param pick     Extrai o dado útil do envelope. É aqui que mora o cast, num
 *                 lugar só por chamada, já que o preload devolve `any`.
 * @param fallback Mensagem quando o main recusa sem dizer o motivo — acontece
 *                 em vários handlers que só devolvem `{ ok: false }`.
 */
export async function unwrap<T>(
  call: Promise<any>,
  pick: (res: any) => T,
  fallback: string
): Promise<T> {
  const res = await call
  if (!res?.ok) throw new Error(res?.error ?? fallback)
  return pick(res)
}
