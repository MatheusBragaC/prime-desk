/*
  Ligação dos listeners do diálogo — o lado com efeito do `lib/useDialogA11y.ts`.

  `dialogTrap.test.mjs` cobre a decisão pura (`trapTarget`). O que faltava é o
  efeito, que é onde a PR #33 pode falhar calada: Escape que não fecha, Tab que
  escapa do diálogo, listener que fica no `document` depois de fechar, foco que
  não volta para quem abriu. Nada disso aparece no typecheck e, na tela, só
  aparece a quem navega de teclado.

  Não há DOM aqui: `document` é casca que REGISTRA add/removeEventListener, e os
  "focáveis" são objetos com `focus()` e `offsetParent`. É o suficiente porque o
  hook só usa esses quatro pontos do DOM — o que continua fora de teste está
  listado no fim do arquivo.
*/

/** `document` e os construtores de elemento precisam existir antes da carga. */
export function setup() {
  class ElementoFake {}
  class InputFake extends ElementoFake {}
  globalThis.HTMLElement = ElementoFake
  globalThis.HTMLInputElement = InputFake

  const doc = {
    activeElement: null,
    listeners: [],
    seletores: [],
    /** Remoção que não casa com nada é defeito, não silêncio: fica contada. */
    remocoesOrfas: 0,
    addEventListener(type, fn, capture) {
      doc.listeners.push({ type, fn, capture })
    },
    removeEventListener(type, fn, capture) {
      const i = doc.listeners.findIndex(
        (l) => l.type === type && l.fn === fn && l.capture === capture
      )
      if (i >= 0) doc.listeners.splice(i, 1)
      else doc.remocoesOrfas++
    }
  }
  globalThis.document = doc
  globalThis.__doc = doc
}

const doc = () => globalThis.__doc

/** Focável de mentira: o hook só olha `offsetParent`, `focus()` e o tipo. */
const elemento = (id, { input = false, oculto = false } = {}) => {
  const el = input ? new globalThis.HTMLInputElement() : new globalThis.HTMLElement()
  el.id = id
  // `offsetParent` nulo é como o hook enxerga "não está na tela".
  el.offsetParent = oculto ? null : { id: 'painel' }
  el.focus = () => {
    doc().activeElement = el
  }
  return el
}

const painel = (lista) => ({
  querySelectorAll: (sel) => {
    doc().seletores.push(sel)
    return lista
  }
})

/** Um evento de teclado que conta o que foi chamado nele. */
const tecla = (key, shiftKey = false) => {
  const ev = {
    key,
    shiftKey,
    parou: 0,
    barrou: 0,
    stopPropagation() {
      ev.parou++
    },
    preventDefault() {
      ev.barrou++
    }
  }
  for (const l of [...doc().listeners]) l.fn(ev)
  return ev
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

export default async function run({ useDialogA11y, hooks, beginRender, resetHooks }) {
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

  /*
    Monta o hook do zero: render, ref do painel no lugar (como o React faz antes
    dos efeitos) e o efeito rodado à mão. Devolve a limpeza, que é o desmontar.
  */
  const montar = (lista, onClose, open = true) => {
    resetHooks()
    beginRender()
    const api = useDialogA11y(open, 'Renomear sessao', onClose)
    api.ref.current = painel(lista)
    const limpar = hooks.effects[0].fn()
    return { ...api, limpar }
  }

  // ------------------------------------------------------------ semântica ARIA
  {
    resetHooks()
    beginRender()
    const { dialogProps } = useDialogA11y(true, 'Renomear sessao', () => {})
    ok('a moldura recebe semantica de dialogo', dialogProps, {
      role: 'dialog',
      'aria-modal': true,
      'aria-label': 'Renomear sessao'
    })
  }

  // -------------------------------------------------- fechado não liga nada
  {
    doc().listeners.length = 0
    const { limpar } = montar([elemento('a')], () => {}, false)
    ok('dialogo fechado nao registra listener', doc().listeners.length, 0)
    ok('e nao devolve limpeza', limpar, undefined)
  }

  // ------------------------------------------------------- abrir liga uma vez
  {
    doc().listeners.length = 0
    doc().activeElement = elemento('gatilho')
    const salvar = elemento('salvar')
    const campo = elemento('campo', { input: true })
    // O input vem DEPOIS do botão de propósito: a preferência pelo campo só é
    // observável se a ordem do DOM não a entrega de graça.
    const { limpar } = montar([salvar, campo], () => {})

    ok('abrir registra um listener', doc().listeners.length, 1)
    ok('o listener e de keydown na fase de captura', [
      doc().listeners[0].type,
      doc().listeners[0].capture
    ], ['keydown', true])
    // Captura importa: sem ela o Escape de um input filho não chega ao hook.

    // O foco inicial é assíncrono de propósito (a moldura ainda vai montar).
    ok('antes do timer o foco ainda e de quem abriu', doc().activeElement.id, 'gatilho')
    await espera(40)
    ok('o campo de texto ganha o foco na frente do botao', doc().activeElement.id, 'campo')
    ok('a consulta exclui botao desabilitado',
      (doc().seletores.at(-1) ?? '').includes('button:not([disabled])'), true)

    limpar()
    ok('desmontar devolve o foco a quem abriu', doc().activeElement.id, 'gatilho')
    ok('e tira o listener do document', doc().listeners.length, 0)
    ok('a remocao casou com o registro', doc().remocoesOrfas, 0)
  }

  // ------------------------------- sem input, o primeiro focável leva o foco
  {
    doc().activeElement = elemento('gatilho')
    const b1 = elemento('primeiro-botao')
    const b2 = elemento('segundo-botao')
    const { limpar } = montar([b1, b2], () => {})
    await espera(40)
    ok('sem input, o foco vai ao primeiro focavel', doc().activeElement.id, 'primeiro-botao')
    limpar()
  }

  // ------------------------------------------------- Escape fecha o diálogo
  {
    let fechou = 0
    const { limpar } = montar([elemento('campo', { input: true })], () => {
      fechou++
    })
    const ev = tecla('Escape')
    ok('Escape fecha', fechou, 1)
    ok('Escape nao vaza para tras (a paleta fecharia junto)', ev.parou, 1)
    ok('Escape nao barra o evento', ev.barrou, 0)
    limpar()
    ok('depois de fechar, Escape nao chama mais', (tecla('Escape'), fechou), 1)
  }

  // ---------------------------------------------------------- armadilha de Tab
  {
    const a = elemento('a', { input: true })
    const b = elemento('b')
    const c = elemento('c')
    const { limpar } = montar([a, b, c], () => {})

    c.focus()
    let ev = tecla('Tab')
    ok('Tab no ultimo volta ao primeiro', doc().activeElement.id, 'a')
    ok('e o Tab foi barrado', ev.barrou, 1)

    a.focus()
    ev = tecla('Tab', true)
    ok('Shift+Tab no primeiro vai ao ultimo', doc().activeElement.id, 'c')
    ok('e o Shift+Tab foi barrado', ev.barrou, 1)

    b.focus()
    ev = tecla('Tab')
    ok('Tab no meio segue a ordem do navegador', doc().activeElement.id, 'b')
    ok('e nao e barrado', ev.barrou, 0)

    // Tecla que não é Escape nem Tab não é assunto do hook.
    b.focus()
    ev = tecla('a')
    ok('tecla comum passa reto', [doc().activeElement.id, ev.barrou, ev.parou], ['b', 0, 0])
    limpar()
  }

  // ------------------------------- oculto não conta: o ciclo é do que se vê
  {
    const visivel1 = elemento('v1', { input: true })
    const visivel2 = elemento('v2')
    /*
      Os ocultos ficam nas PONTAS da lista: no meio, tirá-los ou não dá o mesmo
      ciclo, e o caso passaria sem cobrir o filtro. Nas pontas eles são o que o
      `querySelectorAll` chamaria de primeiro e último — é aí que o filtro conta.
    */
    const { limpar } = montar(
      [elemento('oculto-antes', { oculto: true }), visivel1, visivel2,
        elemento('oculto-depois', { oculto: true })],
      () => {}
    )

    visivel2.focus()
    tecla('Tab')
    ok('Tab no ultimo VISIVEL volta ao primeiro visivel', doc().activeElement.id, 'v1')

    visivel1.focus()
    tecla('Tab', true)
    ok('Shift+Tab no primeiro visivel vai ao ultimo visivel', doc().activeElement.id, 'v2')
    limpar()
  }

  // ------------------- a lista é relida a cada tecla (o diálogo pode ter mudado)
  {
    const a = elemento('a', { input: true })
    const b = elemento('b')
    const lista = [a, b]
    resetHooks()
    beginRender()
    const api = useDialogA11y(true, 'Renomear sessao', () => {})
    api.ref.current = painel(lista)
    const limpar = hooks.effects[0].fn()

    // Um botão que só aparece depois (ex.: "confirmar exclusão") entra no ciclo.
    const c = elemento('c')
    lista.push(c)
    b.focus()
    tecla('Tab')
    ok('focavel que apareceu depois nao vira fim de ciclo', doc().activeElement.id, 'b')
    c.focus()
    tecla('Tab')
    ok('e o novo ultimo fecha o ciclo no primeiro', doc().activeElement.id, 'a')
    limpar()
  }

  // ------------------- onClose muda de identidade a cada render do pai
  {
    let velho = 0
    let novo = 0
    const { limpar } = montar([elemento('campo', { input: true })], () => {
      velho++
    })
    const listenerAntes = doc().listeners[0].fn

    // Re-render do pai: mesmo hook, `onClose` novo, efeito NÃO refeito (deps [open]).
    beginRender()
    const api = useDialogA11y(true, 'Renomear sessao', () => {
      novo++
    })
    api.ref.current = painel([elemento('campo', { input: true })])

    ok('o re-render nao refaz o listener', doc().listeners[0].fn === listenerAntes, true)
    tecla('Escape')
    ok('Escape chama o onClose do render atual', [velho, novo], [0, 1])
    limpar()
  }

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}

/*
  O que esta suíte NÃO cobre, e continua sendo conferência na GUI:

  - `querySelectorAll(FOCUSABLE)` de verdade. Aqui a lista de focáveis é
    injetada; que o seletor pegue exatamente os elementos certos de um diálogo
    real (ordem do DOM, `tabindex`, botão desabilitado) depende do navegador.
  - `offsetParent` de verdade. A casca devolve nulo para "oculto"; se o CSS
    esconde por `visibility` ou `display` no ancestral, quem decide é o layout.
  - Foco de fato: `el.focus()` aqui só anota. Elemento fora da tela, dentro de
    `inert` ou de um `<dialog>` nativo pode recusar o foco.
  - A ordem entre o autofoco (20 ms) e a montagem da moldura: o número existe
    por causa da animação de entrada, e só a tela diz se ainda é suficiente.
  - Escape com foco FORA do diálogo (clique no véu) chegando ao listener de
    captura: a casca chama o handler direto, sem propagação real.
*/
