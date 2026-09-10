/*
  Ciclo do Tab dentro do diálogo.

  A armadilha de foco é o único pedaço do `useDialogA11y` que é decisão pura, e
  era onde o `Modal` errava por omissão antes: com Shift+Tab na primeira posição
  o foco saía do diálogo e ia para a janela atrás. Cada caso abaixo é uma ponta
  da lista, porque só nas pontas o hook intercepta — no meio quem manda é a
  ordem natural do navegador.
*/

export default function run({ trapTarget }) {
  const casos = [
    ['lista vazia não tem para onde ir', [], 'a', false, null],
    ['Tab no último volta para o primeiro', ['a', 'b', 'c'], 'c', false, 'a'],
    ['Shift+Tab no primeiro vai para o último', ['a', 'b', 'c'], 'a', true, 'c'],
    ['Tab no meio não é interceptado', ['a', 'b', 'c'], 'b', false, null],
    ['Shift+Tab no meio não é interceptado', ['a', 'b', 'c'], 'b', true, null],
    ['Tab no primeiro segue natural', ['a', 'b', 'c'], 'a', false, null],
    ['Shift+Tab no último segue natural', ['a', 'b', 'c'], 'c', true, null],
    // Um só focável: o ciclo tem que voltar nele mesmo, senão o Tab escapa.
    ['único item cicla em si mesmo', ['a'], 'a', false, 'a'],
    ['único item cicla em si mesmo com Shift', ['a'], 'a', true, 'a'],
    // Foco fora do diálogo (clique no véu, por exemplo): não é ponta de nada.
    ['foco fora da lista não é interceptado', ['a', 'b'], null, false, null]
  ]

  let ok = true
  for (const [nome, lista, ativo, shift, esperado] of casos) {
    const got = trapTarget(lista, ativo, shift)
    if (got !== esperado) {
      console.error(`  ✗ ${nome}: esperava ${esperado}, veio ${got}`)
      ok = false
    }
  }
  console.log(ok ? 'trapTarget: 10 casos ok' : 'trapTarget: FALHOU')
  return ok
}
