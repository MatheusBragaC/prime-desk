/*
  Casos de `lib/env.ts` — a derivação de estágio e os rótulos do ambiente.

  A regra estava escrita três vezes (duas no Onboarding, uma implícita no
  AccountBadge) e cada cópia podia divergir sem ninguém notar: a tela do
  onboarding só aparece com ambiente incompleto, que é justamente o estado que
  ninguém reproduz à mão. Com uma cópia só, ela cabe em teste.
*/

const env = (installed, version, path, authOk, providers = [], envKeys = []) => ({
  agent: { installed, path, version },
  auth: { ok: authOk, providers, envKeys }
})

export default function run({ stageFor, providerLabel, agentDetail, authDetail }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  // Sem status ainda: "não sei", e não "nada instalado" — a tela não pode
  // piscar "instalar" antes da primeira resposta.
  ok('status nulo -> checking', stageFor(null), 'checking')
  ok('sem binario -> install', stageFor(env(false, null, null, false)), 'install')
  ok('binario sem credencial -> auth',
    stageFor(env(true, '0.9.0', '/usr/bin/prime-agent', false)), 'auth')
  ok('binario e credencial -> ready',
    stageFor(env(true, '0.9.0', '/usr/bin/prime-agent', true, ['anthropic'])), 'ready')
  // Credencial sem binário ainda é "instalar": a ordem dos passos importa.
  ok('credencial sem binario continua em install',
    stageFor(env(false, null, null, true, ['anthropic'])), 'install')

  ok('provedor vence a variavel de ambiente',
    providerLabel('anthropic', 'ANTHROPIC_API_KEY'), 'anthropic')
  ok('sem provedor, a variavel entra sem o sufixo _API_KEY',
    providerLabel(null, 'ANTHROPIC_API_KEY'), 'anthropic')
  ok('sem nada -> null', providerLabel(null, null), null)

  // `t` da casca devolve a própria chave, então o que se afirma aqui é a forma
  // da linha e qual chave foi escolhida.
  ok('detalhe do agente traz versao e caminho',
    agentDetail(env(true, '0.9.0', '/usr/bin/prime-agent', true), false),
    'onb.version 0.9.0 · /usr/bin/prime-agent')
  ok('sem versao, checando ainda -> onb.checking',
    agentDetail(env(false, null, null, false), true), 'onb.checking')
  ok('sem versao, ja checado -> onb.notFound',
    agentDetail(env(false, null, null, false), false), 'onb.notFound')

  ok('auth.json na frente da variavel de ambiente',
    authDetail(env(true, '1', '/p', true, ['anthropic'], ['ANTHROPIC_API_KEY']), false),
    'auth.json: anthropic')
  ok('so variavel de ambiente',
    authDetail(env(true, '1', '/p', true, [], ['ANTHROPIC_API_KEY']), false),
    'onb.envVar: ANTHROPIC_API_KEY')
  ok('sem credencial, ja checado -> onb.noCreds',
    authDetail(env(true, '1', '/p', false), false), 'onb.noCreds')

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
