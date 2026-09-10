/*
  Contagem de referência da assinatura de ambiente.

  `lib/useEnvironment.ts` existe para que `AccountBadge` e `Onboarding` sejam
  dois LEITORES de um assinante só do canal `onboarding:env`. O risco é a
  contagem: watch no primeiro consumidor, unwatch no último. Se ela errar, o
  sintoma não aparece no typecheck nem no build e é sutil na tela — o Onboarding
  para de receber atualização quando o rodapé da conta desmonta, ou sobra
  assinante depois do último consumidor sair.

  A suíte não levanta React: a casca de `react` entrega o `subscribe` que o
  `useSyncExternalStore` recebeu, e cada "consumidor" aqui é uma chamada desse
  subscribe com o seu próprio ouvinte. É a mesma coisa que o React faz ao montar
  e desmontar, sem DOM.
*/

/** `window.prime` precisa existir antes da carga do módulo. */
export function setup() {
  const bus = { canais: [], handlers: [], onCalls: 0, offCalls: 0 }
  bus.emit = (status) => {
    for (const fn of [...bus.handlers]) fn(status)
  }
  globalThis.__bus = bus
  globalThis.window = {
    prime: {
      on: (canal, fn) => {
        bus.onCalls++
        bus.canais.push(canal)
        bus.handlers.push(fn)
        return () => {
          bus.offCalls++
          const i = bus.handlers.indexOf(fn)
          if (i >= 0) bus.handlers.splice(i, 1)
        }
      }
    }
  }
}

const ambiente = (versao) => ({
  agent: { installed: true, path: '/usr/bin/prime-agent', version: versao },
  auth: { ok: true, providers: ['anthropic'], envKeys: [] }
})

export default async function run({
  useEnvironment,
  refreshEnvironment,
  hooks,
  beginRender,
  watchCalls
}) {
  const bus = globalThis.__bus
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(
        `FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`
      )
    }
  }
  const conta = (nome) => watchCalls.filter((c) => c === nome).length

  /*
    Um consumidor: renderiza o hook, pega o `subscribe` que ele passou ao
    `useSyncExternalStore` e assina com ouvinte próprio. `avisos` é quantas
    vezes o React seria mandado re-renderizar — ou seja, se o estado chega.
  */
  const montar = () => {
    beginRender()
    useEnvironment()
    const { subscribe, snapshot } = hooks.store
    let avisos = 0
    const off = subscribe(() => {
      avisos++
    })
    return { desmontar: off, avisos: () => avisos, ler: () => snapshot() }
  }

  // ------------------------------------------------ um sobe, dois sobem
  const a = montar()
  ok('primeiro consumidor: watch uma vez', conta('watch'), 1)
  ok('primeiro consumidor: um assinante do canal', bus.onCalls, 1)
  ok('o canal assinado e o do ambiente', bus.canais, ['onboarding:env'])

  const b = montar()
  ok('segundo consumidor nao pede watch de novo', conta('watch'), 1)
  ok('segundo consumidor nao cria segundo assinante', bus.onCalls, 1)

  bus.emit(ambiente('1.0.0'))
  ok('o estado chega aos dois consumidores', [a.avisos(), b.avisos()], [1, 1])
  ok('e a leitura e a mesma para os dois', a.ler() === b.ler(), true)
  ok('o status ficou guardado', a.ler().status.agent.version, '1.0.0')
  ok('e marcado como vindo do watch', a.ler().from, 'watch')

  // Guarda de sanidade do hook: payload sem `auth` não descreve ambiente.
  bus.emit({ agent: { installed: true } })
  ok('payload sem auth e ignorado', [a.avisos(), b.avisos()], [1, 1])
  ok('e nao sobrescreve o status bom', a.ler().status.agent.version, '1.0.0')

  // ------------------------------------------------ o primeiro cai
  a.desmontar()
  ok('primeiro cai: ninguem desliga o watch', conta('unwatch'), 0)
  ok('primeiro cai: o assinante do canal continua', bus.offCalls, 0)

  bus.emit(ambiente('1.1.0'))
  ok('quem ficou continua recebendo', b.avisos(), 2)
  ok('quem saiu nao recebe mais', a.avisos(), 1)
  ok('o valor novo chegou', b.ler().status.agent.version, '1.1.0')

  // Escrita sob demanda: o refresh também tem que alcançar quem ficou.
  await refreshEnvironment()
  ok('refresh alcanca quem ficou', b.avisos(), 3)
  ok('refresh marca a origem como checagem', b.ler().from, 'check')

  // ------------------------------------------------ o último cai
  b.desmontar()
  ok('ultimo cai: unwatch uma vez', conta('unwatch'), 1)
  ok('ultimo cai: o assinante do canal e desligado', bus.offCalls, 1)
  ok('e nao sobra handler no canal', bus.handlers.length, 0)

  bus.emit(ambiente('9.9.9'))
  ok('sem consumidor, evento nao avisa ninguem', [a.avisos(), b.avisos()], [1, 3])

  // ------------------------------------------------ remonta depois de zerar
  const c = montar()
  ok('remontar depois de zerar pede watch de novo', conta('watch'), 2)
  ok('remontar assina o canal de novo', bus.onCalls, 2)
  bus.emit(ambiente('2.0.0'))
  ok('o consumidor novo recebe', c.avisos(), 1)
  c.desmontar()
  ok('e o unwatch fecha o segundo ciclo', conta('unwatch'), 2)

  // ------------------------------------- ordem intercalada (segundo cai antes)
  watchCalls.length = 0
  const d = montar()
  const e = montar()
  e.desmontar()
  ok('intercalado: segundo cai e o watch fica', [conta('watch'), conta('unwatch')], [1, 0])
  bus.emit(ambiente('3.0.0'))
  ok('intercalado: quem ficou (o primeiro) recebe', d.avisos(), 1)
  d.desmontar()
  ok('intercalado: o ultimo a cair desliga', conta('unwatch'), 1)

  // ------------------------------------- três consumidores, saída no meio
  watchCalls.length = 0
  const f = montar()
  const g = montar()
  const i = montar()
  g.desmontar()
  ok('tres consumidores: a saida do meio nao desliga nada', [conta('watch'), conta('unwatch')], [1, 0])
  bus.emit(ambiente('4.0.0'))
  ok('tres consumidores: os dois que ficaram recebem', [f.avisos(), i.avisos()], [1, 1])
  f.desmontar()
  i.desmontar()
  ok('tres consumidores: unwatch so no fim', conta('unwatch'), 1)
  ok('e o canal fica sem handler', bus.handlers.length, 0)

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
