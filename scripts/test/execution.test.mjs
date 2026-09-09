/*
  Dono do destino de execução: subir a ponte é o único momento em que o destino
  muda, então quem escreve `execution` no store são as três subidas de ponte do
  `lib/useBridge.ts` — boot, `restartBridge` e `fallbackToLocal`.

  Existe porque o defeito anterior era invisível ao typecheck e ao build: o chip
  do composer lia o destino por IPC num efeito com dependência `[cwd]`, e trocar
  de máquina sem trocar de diretório deixava o valor antigo na tela. As
  asserções aqui são sobre a escrita no store, que é o que o chip observa hoje.

  Cada fase parte de um destino DIFERENTE do que o main vai devolver: partir do
  mesmo valor faria a asserção passar sem escrita nenhuma.
*/

/** `window.prime` precisa existir antes da carga do módulo da ponte. */
export function setup() {
  let decided = { kind: 'local' }
  globalThis.__mainDecides = (e) => {
    decided = e
  }
  globalThis.window = {
    prime: {
      on: () => () => {},
      appInfo: async () => ({ version: '0', home: '/home/dev', platform: 'linux', userName: 'dev' }),
      checkEnvironment: async () => ({
        ok: true,
        status: { agent: { installed: true }, auth: { ok: true } }
      }),
      stopBridge: async () => ({ ok: true }),
      // O destino vem da resposta do main, nunca do que foi pedido.
      startBridge: async () => ({ ok: true, cwd: '/tmp/projeto', execution: decided, bridgeId: 'b1' })
    }
  }
}

/** O boot é assíncrono e sem relógio: basta ceder o laço de eventos. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

export default async function run({ useBridge, restartBridge, fallbackToLocal, useAgent, calls, startFrom }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }
  const escritas = () => calls.filter((c) => c.name === 'setExecution')

  // ---------------------------------------------------- boot (primeira subida)
  startFrom({ kind: 'ssh', target: 'resto-de-sessao-anterior' })
  globalThis.__mainDecides({ kind: 'local' })
  useBridge(() => {})
  await settle()

  ok('boot: o store recebe o destino da ponte que subiu',
    useAgent.getState().execution, { kind: 'local' })
  ok('boot: escreveu o destino uma vez', escritas().length, 1)

  // -------------------------------------- restartBridge (troca de destino)
  startFrom({ kind: 'local' })
  globalThis.__mainDecides({ kind: 'ssh', target: 'build-box' })
  const cwd = useAgent.getState().cwd
  ok('a troca de destino da certo', (await restartBridge({ cwd, ssh: 'build-box' })).ok, true)

  ok('o store recebe o destino que o main devolveu',
    useAgent.getState().execution, { kind: 'ssh', target: 'build-box' })
  ok('o diretorio nao mudou — e era ele que disparava a leitura antiga',
    useAgent.getState().cwd, cwd)
  ok('a escrita do destino aconteceu uma vez', escritas().length, 1)

  // O main recusa SSH sem conexão correspondente e cai para local.
  startFrom({ kind: 'ssh', target: 'build-box' })
  globalThis.__mainDecides({ kind: 'local' })
  await restartBridge({ cwd, ssh: 'build-box' })
  ok('main caiu para local: o store acompanha', useAgent.getState().execution, { kind: 'local' })

  // ------------------------------------- fallbackToLocal (destino nao subiu)
  startFrom({ kind: 'ssh', target: 'build-box' })
  globalThis.__mainDecides({ kind: 'local' })
  await fallbackToLocal(cwd)
  ok('fallback: o store sai do SSH que falhou', useAgent.getState().execution, { kind: 'local' })
  ok('fallback: escreveu o destino uma vez', escritas().length, 1)

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
