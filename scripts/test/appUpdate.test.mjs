/*
  Casos da checagem de versao do PROPRIO app.

  `latestFromRelease` e a unica decisao dessa checagem que da para testar sem
  rede, e e onde mora a armadilha: o `tag_name` do GitHub vem com prefixo
  (`v0.2.5`), e comparar string crua diria que `v0.2.5` e maior que `0.2.6`.
  O mesmo erro ja aconteceu de verdade com o manifesto do agente.
*/

export default function run({ latestFromRelease, compareVersions, appUpdateCommand }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) console.log(`ok      ${nome}`)
    else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  // --- latestFromRelease
  ok('tira o prefixo v da tag', latestFromRelease({ tag_name: 'v0.2.5' }), '0.2.5')
  ok('tag sem prefixo passa igual', latestFromRelease({ tag_name: '0.2.5' }), '0.2.5')
  ok('rascunho nao conta', latestFromRelease({ tag_name: 'v9.9.9', draft: true }), null)
  ok('prerelease nao conta', latestFromRelease({ tag_name: 'v9.9.9', prerelease: true }), null)
  ok('release sem tag nao conta', latestFromRelease({}), null)
  ok('tag vazia nao conta', latestFromRelease({ tag_name: '   ' }), null)
  ok('tag que e so o v nao conta', latestFromRelease({ tag_name: 'v' }), null)

  // --- a comparacao que decide se ha atualizacao
  const disponivel = (instalada, tag) => {
    const latest = latestFromRelease({ tag_name: tag })
    return Boolean(latest && compareVersions(latest, instalada) > 0)
  }
  ok('0.2.5 instalada, v0.2.6 publicada -> atualiza', disponivel('0.2.5', 'v0.2.6'), true)
  ok('mesma versao -> nao atualiza', disponivel('0.2.6', 'v0.2.6'), false)
  // O caso que a comparacao crua de string erraria.
  ok('0.2.6 instalada, v0.2.5 publicada -> NAO atualiza',
    disponivel('0.2.6', 'v0.2.5'), false)
  ok('0.9.9 instalada, v0.10.0 publicada -> atualiza (compara numero, nao texto)',
    disponivel('0.9.9', 'v0.10.0'), true)
  // O salto desta release: o major sobe e o resto zera.
  ok('0.2.6 instalada, v1.0.0 publicada -> atualiza',
    disponivel('0.2.6', 'v1.0.0'), true)

  // --- o comando de instalacao
  const cmd = appUpdateCommand()
  ok('o comando usa o install.sh do repo, nao logica duplicada',
    [cmd.includes('install.sh'), cmd.startsWith('curl ')], [true, true])

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
