/*
  Casos de `detectDocument` — a heurística que decide se um texto vira um
  cartão de documento em vez de aparecer corrido na conversa.

  `PLANO_REAL` é um plano de implementação de verdade, saído de uma sessão real
  do usuário: 9973 caracteres, onze títulos. É o caso que motivou a
  funcionalidade, e o único jeito de garantir que a heurística continua
  reconhecendo ele é ter o texto no repositório, não descrito de memória.
*/
import { PLANO_REAL } from './fixtures-plano.mjs'

export default function run({ detectDocument }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) {
      console.log(`ok      ${nome}`)
    } else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  const real = detectDocument(PLANO_REAL)
  ok('reconhece o plano real', [real?.title, real?.headingCount],
    ['Plano de Implementação — Elevar o MCP Gnexum↔Satryo', 11])

  ok('resposta curta não é documento',
    detectDocument('Sim, dá para fazer isso.'), null)

  ok('heading dentro de bloco de código não conta',
    detectDocument(
      'Aqui está o exemplo:\n\n```markdown\n# Não é título de verdade\n## Nem este\n```\n\nUse assim. ' +
        'x'.repeat(500)
    ),
    null)

  ok('um título só não é documento — precisa de pelo menos dois',
    detectDocument('# Só um título\n\n' + 'Texto normal explicando uma coisa qualquer. '.repeat(30)),
    null)

  /*
    O caso real que motivou este arquivo a mudar: uma resposta de conversa
    comum, que organiza os achados com `##` mas ABRE com uma frase corrida, não
    com título. A primeira versão da heurística contava só o número de títulos
    em qualquer lugar do texto e tratava isso como documento — errado, porque
    "expliquei em tópicos" não é "escrevi um plano".
  */
  ok('resposta de conversa com sub-titulos, mas que NAO abre com titulo, nao e documento',
    detectDocument(
      'Fui olhar de novo. Você tinha razão — achei três problemas reais no que eu fiz:\n\n' +
        '## Problema 1 — condição de corrida no transporte\n' +
        'Texto explicando o primeiro problema com detalhe suficiente para passar do limite. '.repeat(6) +
        '\n\n## Problema 2 — resposta 405 no GET\n' +
        'Texto explicando o segundo problema, também com detalhe. '.repeat(6) +
        '\n\n## Problema 3 — roles não resolvidos\n' +
        'Texto explicando o terceiro problema. '.repeat(6)
    ),
    null)

  // O mesmo conteúdo, mas abrindo com o título: aí sim é documento.
  ok('o mesmo conteudo, abrindo com titulo, e documento',
    detectDocument(
      '# Três problemas encontrados na revisão\n\n' +
        '## Problema 1 — condição de corrida no transporte\n' +
        'Texto explicando o primeiro problema com detalhe suficiente para passar do limite. '.repeat(6) +
        '\n\n## Problema 2 — resposta 405 no GET\n' +
        'Texto explicando o segundo problema, também com detalhe. '.repeat(6)
    ) !== null,
    true)

  ok('texto longo sem título nenhum não é documento',
    detectDocument('Isto é uma explicação longa sem nenhuma estrutura de título. '.repeat(30)),
    null)

  const doisTitulos = '# Título principal\n\n' + 'Parágrafo. '.repeat(60) + '\n\n## Segundo título\n\nMais texto.'
  const dt = detectDocument(doisTitulos)
  ok('dois títulos e tamanho suficiente já contam',
    [dt !== null, dt?.headingCount], [true, 2])

  ok('título extraído sem os `#` e sem markdown grosso',
    detectDocument('## **Relatório** de teste\n\n' + 'Conteúdo. '.repeat(60) + '\n\n## Outro título')?.title,
    'Relatório de teste')

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
