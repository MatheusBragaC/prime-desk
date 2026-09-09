/*
  Dono do destino de execução: subir a ponte é o único momento em que o destino
  muda, então é `restartBridge` quem escreve `execution` no store.

  Existe porque o defeito anterior era invisível ao typecheck e ao build: o chip
  do composer lia o destino por IPC num efeito com dependência `[cwd]`, e trocar
  de máquina sem trocar de diretório deixava o valor antigo na tela. A asserção
  aqui é sobre a escrita no store, que é o que o chip observa hoje.
*/

/** `window.prime` precisa existir antes da carga do módulo da ponte. */
export function setup() {
  let decided = { kind: 'local' }
  globalThis.__mainDecides = (e) => {
    decided = e
  }
  globalThis.window = {
    prime: {
      stopBridge: async () => ({ ok: true }),
      // O destino vem da resposta do main, nunca do que foi pedido.
      startBridge: async () => ({ ok: true, cwd: '/tmp/projeto', execution: decided, bridgeId: 'b1' })
    }
  }
}

export default async function run({ restartBridge, useAgent, calls }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  ok('destino comeca local', useAgent.getState().execution, { kind: 'local' })

  // O caso do defeito: troca de destino com o mesmo diretório.
  const cwd = useAgent.getState().cwd
  globalThis.__mainDecides({ kind: 'ssh', target: 'build-box' })
  ok('a troca de destino da certo', (await restartBridge({ cwd, ssh: 'build-box' })).ok, true)

  ok('o store recebe o destino que o main devolveu',
    useAgent.getState().execution, { kind: 'ssh', target: 'build-box' })
  ok('o diretorio nao mudou — e era ele que disparava a leitura antiga',
    useAgent.getState().cwd, cwd)
  ok('a escrita do destino aconteceu uma vez',
    calls.filter((c) => c.name === 'setExecution').length, 1)

  // O main recusa SSH sem conexão correspondente e cai para local.
  globalThis.__mainDecides({ kind: 'local' })
  await restartBridge({ cwd, ssh: 'build-box' })
  ok('main caiu para local: o store acompanha', useAgent.getState().execution, { kind: 'local' })

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
