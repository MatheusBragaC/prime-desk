/*
  Casos de `stallOf` — a decisão de quando a interface diz que o turno está
  quieto. Entradas fabricadas, sem React e sem esperar o relógio.

  O caso de 40 minutos é literal: foi o que aconteceu numa sessão real, com uma
  consulta ao Postgres presa atrás de uma trava de migration, e a tela mostrou o
  mesmo spinner de uma chamada de dois segundos.
*/

const T0 = 1_000_000_000_000
const min = (n) => n * 60_000

const rodando = (id, startedAt) => ({
  id, name: 'bash', args: { command: 'psql ...' }, status: 'running', text: '', startedAt
})
const pronto = (id) => ({ id, name: 'bash', args: {}, status: 'ok', text: 'saida', durationMs: 500 })

export default function run({ stallOf, NOTICE_AFTER_MS }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  console.log(`limiar em uso: ${NOTICE_AFTER_MS / 60_000} min\n`)

  ok('turno parado nunca avisa, nem com ferramenta pendurada',
    stallOf({ streaming: false, tools: { a: rodando('a', T0 - min(90)) }, lastChange: T0 - min(90), now: T0 }),
    null)

  ok('ferramenta com 10s nao avisa',
    stallOf({ streaming: true, tools: { a: rodando('a', T0 - 10_000) }, lastChange: T0 - min(30), now: T0 }),
    null)

  const caso = stallOf({ streaming: true, tools: { a: rodando('a', T0 - min(40)) }, lastChange: T0 - min(40), now: T0 })
  ok('o caso real: 40 min numa chamada -> avisa como tool', [caso?.kind, caso?.ms], ['tool', min(40)])

  ok('exatamente no limiar avisa',
    stallOf({ streaming: true, tools: { a: rodando('a', T0 - NOTICE_AFTER_MS) }, lastChange: T0, now: T0 })?.kind,
    'tool')
  ok('um ms antes do limiar nao avisa',
    stallOf({ streaming: true, tools: { a: rodando('a', T0 - NOTICE_AFTER_MS + 1) }, lastChange: T0, now: T0 }),
    null)

  const varias = stallOf({
    streaming: true, now: T0, lastChange: T0,
    tools: { a: rodando('a', T0 - min(4)), b: rodando('b', T0 - min(20)), c: rodando('c', T0 - min(9)) }
  })
  ok('entre varias, aponta a mais antiga', [varias?.tool?.id, varias?.ms], ['b', min(20)])

  ok('chamada terminada e ignorada',
    stallOf({ streaming: true, tools: { a: pronto('a') }, lastChange: T0 - min(1), now: T0 }),
    null)

  const q = stallOf({ streaming: true, tools: { a: pronto('a') }, lastChange: T0 - min(7), now: T0 })
  ok('nada rodando e 7 min sem novidade -> quiet', [q?.kind, q?.ms], ['quiet', min(7)])

  ok('running sem startedAt (conversa vinda do disco) nao inventa relogio',
    stallOf({ streaming: true, tools: { a: { ...rodando('a'), startedAt: undefined } }, lastChange: T0, now: T0 }),
    null)

  ok('turno recem-comecado, sem ferramenta, nao avisa',
    stallOf({ streaming: true, tools: {}, lastChange: T0 - 5_000, now: T0 }),
    null)

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
