/*
  Casos de `readDiskTree` — a arvore lida de `session-artifacts/`, que existe
  porque `prime-agent list --json` nao ve conversa fora do daemon.

  Cada caso monta um fixture com o layout REAL confirmado numa sessao em
  andamento: `rlm-subagent.json` ao lado do transcript, `semantic-edges.jsonl`
  dividindo o diretorio (e nao sendo transcript), e netos aninhados em `sub-*`
  dentro da pasta do pai.
*/
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Transcript minimo, no formato de linha do prime-agent. */
function transcript(id, { cwd = '/repo', depth = 0, msgs = [], model, sendToParent = false } = {}) {
  const lines = [JSON.stringify({ type: 'session', version: 3, id, cwd, rlmDepth: depth })]
  /*
    A linha real traz os DOIS campos: `id` e o hash do evento, `modelId` e o
    modelo. O fixture escreve os dois para o caso conseguir provar qual deles o
    parser lê — com só um, o teste passava lendo o errado.
  */
  if (model) {
    lines.push(JSON.stringify({
      type: 'model_change', provider: 'anthropic', id: 'fd2d437d', modelId: model
    }))
  }
  for (const m of msgs) {
    lines.push(JSON.stringify({
      type: 'message',
      message: {
        role: m.role,
        content: [{ type: 'text', text: m.text ?? 'x' }],
        timestamp: m.at,
        ...(m.usage ? { usage: m.usage } : {})
      }
    }))
  }
  if (sendToParent) {
    lines.push(JSON.stringify({
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 't1', name: 'ipython',
          arguments: { code: "await agent_message.send('pronto', receiver_role='parent')" } }]
      }
    }))
  }
  return lines.join('\n') + '\n'
}

/** Linha `custom_message` como o agente escreve a encomenda do pai. */
const tarefaDoPai = (texto) =>
  JSON.stringify({ type: 'custom_message', customType: 'agent_message',
    content: `[task from parent]\n\n${texto}` })

/** Mensagem `toolResult`, que é de onde sai o nome da ferramenta. */
const ferramenta = (nome) =>
  JSON.stringify({ type: 'message', message: { role: 'toolResult', toolName: nome,
    content: [{ type: 'text', text: 'saida' }] } })

const uso = (input, output, cacheRead, total) => ({
  input, output, cacheRead, cacheWrite: 0, totalTokens: input + output + cacheRead,
  cost: { total }
})

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'prime-desk-tree-'))
  const sessionsDir = join(base, 'sessions')
  const artifactsDir = join(base, 'session-artifacts')
  mkdirSync(sessionsDir)
  mkdirSync(artifactsDir)
  return { base, sessionsDir, artifactsDir }
}

function subagente(dir, { childId, name, status, sessionId, opts = {} }) {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${sessionId}.jsonl`)
  writeFileSync(file, transcript(sessionId, opts))
  // Divide o diretorio com o transcript e NAO e transcript.
  writeFileSync(join(dir, 'semantic-edges.jsonl'), '{"a":1}\n')
  writeFileSync(join(dir, 'rlm-subagent.json'), JSON.stringify({
    type: 'rlm_subagent', childId, sessionName: name, sessionFile: file,
    status, model: { provider: 'anthropic', modelId: 'claude-opus-5' },
    updatedAt: '2026-09-09T14:00:00.000Z'
  }))
  return file
}

export default function run({ readDiskTree, resetDiskTreeCache }) {
  let falhas = 0
  const ok = (nome, real, esperado) => {
    if (JSON.stringify(real) === JSON.stringify(esperado)) console.log(`ok      ${nome}`)
    else {
      falhas++
      console.log(`FALHOU  ${nome}\n  esperado ${JSON.stringify(esperado)}\n  veio     ${JSON.stringify(real)}`)
    }
  }

  const casos = []
  const caso = (nome, fn) => casos.push([nome, fn])

  caso('sessao que nao escreveu nada devolve null', async () => {
    const f = fixture()
    resetDiskTreeCache()
    ok('null quando nao ha transcript nem artefato',
      await readDiskTree({ rootSessionId: 'inexistente', ...f }), null)
  })

  caso('conversa sem subagente devolve a raiz sozinha', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'),
      transcript('raiz', { cwd: '/repo', msgs: [{ role: 'user', text: 'oi' }] }))
    const t = await readDiskTree({ rootSessionId: 'raiz', rootBusy: true, ...f })
    ok('raiz existe, sem filhos, marcada como trabalhando',
      [t?.kind, t?.children.length, t?.status, t?.source, t?.messageCount],
      ['root', 0, 'working', 'disk', 1])
    ok('raiz parada nao aparece como trabalhando',
      (await readDiskTree({ rootSessionId: 'raiz', rootBusy: false, ...f }))?.status, 'idle')
  })

  caso('arvore com filhos, netos, status e custo', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'), transcript('raiz', {
      msgs: [{ role: 'user', text: 'audita o projeto' }, { role: 'assistant', usage: uso(10, 5, 100, 0.02) }]
    }))
    const raizDir = join(f.artifactsDir, 'raiz')
    subagente(join(raizDir, 'sub-aaa'), {
      childId: 'sub-aaa', name: 'audit-tipagem', status: 'completed', sessionId: 'filho-a',
      opts: { depth: 1, sendToParent: true, model: 'claude-opus-5',
        msgs: [{ role: 'user', text: 'tarefa' }, { role: 'assistant', usage: uso(100, 50, 900, 0.30) }] }
    })
    subagente(join(raizDir, 'sub-bbb'), {
      childId: 'sub-bbb', name: 'fix-tipagem', status: 'running', sessionId: 'filho-b',
      opts: { depth: 1, msgs: [{ role: 'user', text: 'aplica' }] }
    })
    // Neto: dentro da pasta do proprio pai, sem camada intermediaria.
    subagente(join(raizDir, 'sub-aaa', 'sub-ccc'), {
      childId: 'sub-ccc', name: 'props-a', status: 'deleted', sessionId: 'neto-c',
      opts: { depth: 2, sendToParent: true,
        msgs: [{ role: 'assistant', usage: uso(1, 1, 8, 0.05) }] }
    })

    const t = await readDiskTree({ rootSessionId: 'raiz', rootBusy: true, ...f })
    const porNome = Object.fromEntries((t?.children ?? []).map((c) => [c.name, c]))

    ok('dois filhos diretos, em ordem estavel',
      (t?.children ?? []).map((c) => c.name), ['audit-tipagem', 'fix-tipagem'])
    ok('neto entra como filho do filho, com profundidade 2',
      [porNome['audit-tipagem'].children.length,
       porNome['audit-tipagem'].children[0].name,
       porNome['audit-tipagem'].children[0].depth],
      [1, 'props-a', 2])
    ok('running vira trabalhando', porNome['fix-tipagem'].status, 'working')
    ok('completed vira concluido', porNome['audit-tipagem'].status, 'done')
    ok('deleted tambem e concluido, nao ocioso',
      porNome['audit-tipagem'].children[0].status, 'done')
    ok('respondeu sai de agent_message.send, nao de ter terminado',
      [porNome['audit-tipagem'].replied, porNome['fix-tipagem'].replied], [true, false])
    ok('raiz sabe que tem filho rodando', t?.hasRunningChildren, true)
    ok('filho sem filho rodando nao mente', porNome['fix-tipagem'].hasRunningChildren, false)

    // Custo proprio, mesma conta do prime-agent: input + cacheRead + cacheWrite.
    ok('custo e tokens proprios do no, sem somar filhos',
      [porNome['audit-tipagem'].usage?.inputTokens,
       porNome['audit-tipagem'].usage?.outputTokens,
       Number(porNome['audit-tipagem'].usage?.cost.toFixed(2))],
      [1000, 50, 0.30])
    ok('raiz tem o gasto dela, nao o dos filhos',
      [t?.usage?.inputTokens, Number(t?.usage?.cost.toFixed(2))], [110, 0.02])
    ok('semantic-edges.jsonl nao foi confundido com transcript',
      porNome['fix-tipagem'].sessionFile.endsWith('filho-b.jsonl'), true)
    ok('modelo vem do arquivo de estado do subagente',
      porNome['audit-tipagem'].modelName, 'claude-opus-5')
  })

  caso('leitura incremental soma o pedaco novo, sem recontar', async () => {
    const f = fixture()
    resetDiskTreeCache()
    const file = join(f.sessionsDir, 'raiz.jsonl')
    writeFileSync(file, transcript('raiz', { msgs: [{ role: 'user', text: 'primeira' }] }))
    const antes = await readDiskTree({ rootSessionId: 'raiz', ...f })

    // Acrescenta uma mensagem, como o agente faz: append puro.
    writeFileSync(file, transcript('raiz', {
      msgs: [{ role: 'user', text: 'primeira' }, { role: 'assistant', usage: uso(2, 3, 5, 0.01) }]
    }))
    const depois = await readDiskTree({ rootSessionId: 'raiz', ...f })

    ok('contagem cresce de 1 para 2, sem duplicar',
      [antes?.messageCount, depois?.messageCount], [1, 2])
    ok('a primeira mensagem continua sendo a primeira',
      depois?.firstMessage, 'primeira')
    ok('usage aparece so depois de existir',
      [antes?.usage, depois?.usage?.inputTokens], [undefined, 7])
  })

  caso('o nome do modelo vem de modelId, nao do hash do evento', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'),
      transcript('raiz', { model: 'claude-opus-5', msgs: [{ role: 'user', text: 'oi' }] }))
    const t = await readDiskTree({ rootSessionId: 'raiz', ...f })
    // A linha tem `id: 'fd2d437d'` e `modelId: 'claude-opus-5'`. Lendo `id`, a
    // raiz exibia o hash do evento no lugar do modelo.
    ok('raiz mostra o modelo, nao fd2d437d', t?.modelName, 'claude-opus-5')
  })

  caso('a tarefa do subagente vem do prompt, nao da mensagem de usuario', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'), transcript('raiz'))
    const dir = join(f.artifactsDir, 'raiz', 'sub-aa')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'filho.jsonl')
    // Transcript real de subagente: SO assistant e toolResult, nenhum user.
    writeFileSync(file, transcript('filho', { depth: 1 }) +
      JSON.stringify({ type: 'message', message: { role: 'assistant',
        content: [{ type: 'text', text: 'trabalhando' }] } }) + '\n')
    writeFileSync(join(dir, 'rlm-subagent.json'), JSON.stringify({
      type: 'rlm_subagent', childId: 'sub-aa', sessionName: 'auditar', sessionFile: file,
      status: 'running', prompt: 'Confere a paridade das chaves de i18n.',
      createdAt: 1787343779168, model: { modelId: 'claude-opus-5' }
    }))
    const t = await readDiskTree({ rootSessionId: 'raiz', ...f })
    const filho = t?.children[0]
    ok('firstMessage traz a encomenda do pai',
      filho?.firstMessage, 'Confere a paridade das chaves de i18n.')
    ok('startedAt sai do createdAt em ISO',
      filho?.startedAt, new Date(1787343779168).toISOString())
  })

  caso('sem prompt no metadado, a tarefa sai do [task from parent]', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'), transcript('raiz'))
    const dir = join(f.artifactsDir, 'raiz', 'sub-bb')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'filho.jsonl')
    writeFileSync(file, transcript('filho', { depth: 1 }) + tarefaDoPai('Roda o check de RPC.') + '\n')
    writeFileSync(join(dir, 'rlm-subagent.json'), JSON.stringify({
      type: 'rlm_subagent', childId: 'sub-bb', sessionName: 'rpc', sessionFile: file,
      status: 'completed'
    }))
    const t = await readDiskTree({ rootSessionId: 'raiz', ...f })
    ok('o prefixo [task from parent] e removido',
      t?.children[0]?.firstMessage, 'Roda o check de RPC.')
  })

  caso('a ultima ferramenta e as contagens saem do toolResult', async () => {
    const f = fixture()
    resetDiskTreeCache()
    writeFileSync(join(f.sessionsDir, 'raiz.jsonl'),
      transcript('raiz') + ferramenta('ipython') + '\n' + ferramenta('bash') + '\n' + ferramenta('grep') + '\n')
    const t = await readDiskTree({ rootSessionId: 'raiz', ...f })
    ok('lastTool e a ULTIMA, nao a primeira', t?.lastTool, 'grep')
    ok('toolCount conta as tres', t?.toolCount, 3)
  })

  return (async () => {
    for (const [nome, fn] of casos) {
      try {
        await fn()
      } catch (e) {
        falhas++
        console.log(`FALHOU  ${nome} — exceção: ${e.message}`)
      }
    }
    console.log(falhas ? `\n${falhas} teste(s) falharam` : '\ntodos passaram')
    return falhas === 0
  })()
}
