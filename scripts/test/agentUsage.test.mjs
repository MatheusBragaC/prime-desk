/*
  Casos de `sumTreeUsage` — a soma que faltava depois do incidente do Gnexum:
  três subagentes rodaram, e não dava pra saber quanto cada um, nem o total,
  tinha custado.
*/

const noh = (id, usage, children = []) => ({
  activeSessionId: id, sessionId: id, sessionFile: '', name: id, kind: 'subagent',
  depth: 1, status: 'idle', taskState: '', replied: true, hasRunningChildren: false,
  messageCount: 1, firstMessage: '', cwd: '', modelName: '', lastActivityAt: '',
  usage, children
})

export default function run({ sumTreeUsage }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  ok('snapshot nulo -> null', sumTreeUsage(null), null)

  ok('arvore sem nenhum usage relatado -> null, nao zero',
    sumTreeUsage({ roots: [noh('a', undefined)], total: 1, subagents: 0, at: 0 }),
    null)

  // O caso real: tres subagentes, cada um com gasto proprio.
  const gnexum = {
    roots: [{
      ...noh('root', undefined),
      children: [
        noh('migrations', { inputTokens: 12000, outputTokens: 3000, cost: 0.18 }),
        noh('txmode', { inputTokens: 8000, outputTokens: 2000, cost: 0.12 }),
        noh('deploy', { inputTokens: 15000, outputTokens: 4000, cost: 0.22 })
      ]
    }],
    total: 4, subagents: 3, at: 0
  }
  ok('soma os tres subagentes, ignora o root sem usage',
    sumTreeUsage(gnexum),
    { inputTokens: 35000, outputTokens: 9000, cost: 0.52 })

  // Um nó com dado no meio de outros sem — o total ainda existe (`found` vira
  // true assim que QUALQUER nó relata algo).
  ok('um so nó com usage, entre varios sem, ja basta pra existir total',
    sumTreeUsage({
      roots: [noh('a', undefined), noh('b', { inputTokens: 100, outputTokens: 50, cost: 0.01 })],
      total: 2, subagents: 0, at: 0
    }),
    { inputTokens: 100, outputTokens: 50, cost: 0.01 })

  // Netos contam, nao so filhos diretos.
  ok('soma tambem os netos, nao so os filhos diretos',
    sumTreeUsage({
      roots: [noh('a', { inputTokens: 1, outputTokens: 1, cost: 0.01 }, [
        noh('neto', { inputTokens: 2, outputTokens: 2, cost: 0.02 })
      ])],
      total: 2, subagents: 1, at: 0
    }),
    { inputTokens: 3, outputTokens: 3, cost: 0.03 })

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
