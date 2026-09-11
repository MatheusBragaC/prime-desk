/*
  Fusão da árvore do daemon com a do disco.

  O caso real que motiva: `prime-agent list --json` só enxerga sessão residente
  no daemon, e o app sobe cada conversa como `--mode rpc` solto. Então o nó que
  o daemon devolve para a conversa aberta chega com `children: []` — mesmo com
  subagentes trabalhando. O código anterior, ao ver o `sessionId` conhecido,
  descartava a árvore de disco INTEIRA e ficava com o nó vazio do daemon: a
  árvore esvaziava justamente quando o daemon conhecia a conversa.
*/

/** Nó mínimo, com só o que a fusão olha. */
function no(sessionId, extra = {}) {
  return {
    activeSessionId: extra.activeSessionId ?? sessionId,
    sessionId,
    sessionFile: '',
    name: extra.name ?? sessionId,
    kind: extra.kind ?? 'subagent',
    depth: extra.depth ?? 1,
    status: extra.status ?? 'idle',
    taskState: extra.taskState ?? '',
    replied: false,
    hasRunningChildren: false,
    messageCount: 0,
    firstMessage: extra.firstMessage ?? '',
    startedAt: extra.startedAt,
    lastTool: extra.lastTool,
    toolCount: extra.toolCount,
    cwd: '',
    modelName: '',
    lastActivityAt: '',
    source: extra.source ?? 'daemon',
    children: extra.children ?? []
  }
}

export default function run({ fundir, fundirNaFloresta }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) console.log(`ok      ${nome}`)
    else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  // 1. O caso que quebrava: daemon sem filhos, disco com dois.
  {
    const daemon = no('raiz', { kind: 'root', depth: 0, taskState: 'needs_input', children: [] })
    const disco = no('raiz', {
      kind: 'root', depth: 0, source: 'disk',
      children: [no('f1', { source: 'disk', status: 'working' }), no('f2', { source: 'disk' })]
    })
    const r = fundir(daemon, disco)
    ok('os filhos do disco sobrevivem', r.children.map((c) => c.sessionId), ['f1', 'f2'])
    ok('o taskState do daemon é preservado', r.taskState, 'needs_input')
    ok('hasRunningChildren é recalculado depois da fusão', r.hasRunningChildren, true)
  }

  // 2. Campos que só o disco tem entram; os do daemon não são sobrescritos.
  {
    const daemon = no('x', { firstMessage: '', taskState: 'algo' })
    const disco = no('x', {
      source: 'disk', firstMessage: 'Confere a paridade das chaves.',
      startedAt: '2026-09-10T12:00:00.000Z', lastTool: 'ipython', toolCount: 7
    })
    const r = fundir(daemon, disco)
    ok('tarefa, início e ferramenta vêm do disco',
      [r.firstMessage, r.startedAt, r.lastTool, r.toolCount],
      ['Confere a paridade das chaves.', '2026-09-10T12:00:00.000Z', 'ipython', 7])
  }

  {
    const daemon = no('x', { firstMessage: 'do daemon', lastTool: 'bash', toolCount: 2 })
    const disco = no('x', { source: 'disk', firstMessage: 'do disco', lastTool: 'grep', toolCount: 9 })
    const r = fundir(daemon, disco)
    ok('o que o daemon já tem não é sobrescrito',
      [r.firstMessage, r.lastTool, r.toolCount], ['do daemon', 'bash', 2])
  }

  // 3. Filho conhecido pelos dois lados é fundido, não duplicado.
  {
    const daemon = no('p', { children: [no('c1', { taskState: 'needs_input' })] })
    const disco = no('p', {
      source: 'disk',
      children: [
        no('c1', { source: 'disk', lastTool: 'ipython', children: [no('neto', { source: 'disk' })] }),
        no('c2', { source: 'disk' })
      ]
    })
    const r = fundir(daemon, disco)
    ok('nada duplica', r.children.map((c) => c.sessionId), ['c1', 'c2'])
    ok('o filho comum mantém o taskState do daemon e ganha o do disco',
      [r.children[0].taskState, r.children[0].lastTool], ['needs_input', 'ipython'])
    ok('o neto que só o disco viu é pendurado',
      r.children[0].children.map((c) => c.sessionId), ['neto'])
  }

  // 4. A fusão acha o nó em qualquer profundidade da floresta.
  {
    const floresta = [no('outra'), no('avo', { children: [no('alvo')] })]
    const achou = fundirNaFloresta(floresta, no('alvo', {
      source: 'disk', children: [no('novo', { source: 'disk', status: 'working' })]
    }))
    ok('encontrou o nó aninhado', achou, true)
    ok('o filho entrou lá dentro',
      floresta[1].children[0].children.map((c) => c.sessionId), ['novo'])
    ok('o avô recalcula hasRunningChildren', floresta[1].hasRunningChildren, true)
  }

  {
    const floresta = [no('a'), no('b')]
    ok('sessionId ausente na floresta devolve false',
      fundirNaFloresta(floresta, no('z', { source: 'disk' })), false)
  }

  console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
  return falhas === 0
}
