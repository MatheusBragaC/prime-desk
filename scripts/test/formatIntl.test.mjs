/*
  Tempo relativo e data absoluta seguem o idioma da interface.

  O caso real: `relTime` tinha 'agora', 'min', 'h' e 'd' cravados em português
  e caía num `toLocaleDateString('pt-BR')` fixo. Um usuário com a interface em
  inglês via "há 3 h" e "11/07/2026" — o idioma do app não chegava ao
  formatador, e não havia como notar sem trocar de idioma na mão.
*/

/** Um instante no passado, em ISO. */
const atras = (ms) => new Date(Date.now() - ms).toISOString()
/** Um instante no futuro, em ISO. */
const adiante = (ms) => new Date(Date.now() + ms).toISOString()

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

export default function run(mod) {
  const { relTime, untilTime, fmtCount } = mod
  let falhas = 0
  const checa = (nome, cond, visto) => {
    if (cond) console.log('ok      ' + nome)
    else {
      console.log(`FALHOU  ${nome} — viu ${JSON.stringify(visto)}`)
      falhas++
    }
  }

  /*
    1. Cada degrau tem que sair IGUAL ao que a plataforma produz para aquele
       idioma. Procurar palavra portuguesa numa lista não serve: só pega o que
       quem escreveu o teste lembrou de listar — uma versão anterior desta
       suíte deixou passar um `${sec} seg` cravado. Comparar contra o próprio
       Intl reprova qualquer texto escrito à mão, em qualquer idioma.
  */
  const etiqueta = { pt: 'pt-BR', en: 'en', es: 'es' }
  const degraus = [
    [45 * 1000, -45, 'second'],
    [5 * MIN, -5, 'minute'],
    [3 * HORA, -3, 'hour'],
    [2 * DIA, -2, 'day']
  ]
  const divergencias = []
  for (const lang of ['pt', 'en', 'es']) {
    const ref = new Intl.RelativeTimeFormat(etiqueta[lang], {
      numeric: 'always',
      style: 'narrow'
    })
    for (const [ms, valor, unidade] of degraus) {
      const visto = relTime(atras(ms), lang)
      const esperado = ref.format(valor, unidade)
      if (visto !== esperado) divergencias.push(`${lang} ${unidade}: ${visto} != ${esperado}`)
    }
  }
  checa('cada degrau bate com o Intl do idioma', divergencias.length === 0, divergencias)

  const emIngles = [relTime(atras(400 * DIA), 'en'), untilTime(adiante(5 * MIN), 'en')]
  checa(
    'interface em inglês não recebe data dd/mm/aaaa',
    !emIngles.some((s) => /\d{2}\/\d{2}\/\d{4}/.test(s)),
    emIngles
  )

  // 2. Os três idiomas devolvem coisas diferentes — prova que `lang` chega.
  const cincoMin = ['pt', 'en', 'es'].map((l) => relTime(atras(5 * MIN), l))
  checa('os três idiomas formatam diferente', new Set(cincoMin).size === 3, cincoMin)

  // 3. "agora" é palavra, não "há 0 seg.".
  const agoras = ['pt', 'en', 'es'].map((l) => relTime(atras(200), l))
  checa(
    'menos de um segundo vira palavra, não zero',
    agoras.every((s) => !/\b0\b/.test(s)),
    agoras
  )

  // 4. Data antiga leva o ano; data deste ano, não.
  const velha = relTime(atras(400 * DIA), 'pt')
  const recente = relTime(atras(40 * DIA), 'pt')
  checa('data de outro ano traz o ano', /\d{4}/.test(velha), velha)
  checa('data deste ano dispensa o ano', !/\d{4}/.test(recente), recente)

  // 5. Futuro é futuro: `untilTime` não pode dizer "agora" para daqui a uma hora.
  const daquiUmaHora = ['pt', 'en', 'es'].map((l) => untilTime(adiante(HORA), l))
  checa(
    'uma hora no futuro não é "agora"',
    daquiUmaHora.every((s) => !/agora|now|ahora/i.test(s)),
    daquiUmaHora
  )
  checa('vencido é "agora"', /agora/i.test(untilTime(atras(HORA), 'pt')), untilTime(atras(HORA), 'pt'))

  // 6. Data inválida continua devolvendo vazio, não "Invalid Date".
  checa('ISO inválido devolve vazio', relTime('nao-e-data', 'pt') === '', relTime('nao-e-data', 'pt'))

  // 7. Separador de milhar segue a interface, não o sistema.
  const milhares = [fmtCount(999, 'pt'), fmtCount(999, 'en')]
  checa('milhar usa o idioma da interface', milhares[0] === '999' && milhares[1] === '999', milhares)
  const grande = [fmtCount(1999, 'pt'), fmtCount(1999, 'en')]
  checa('abreviação de milhar não regrediu', grande.every((s) => s === '2.0k'), grande)

  return falhas === 0
}
