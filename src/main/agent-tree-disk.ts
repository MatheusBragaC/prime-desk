import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AgentNode } from '../shared/protocol.js'
import { paths } from './session-catalog.js'

/**
 * Árvore de agentes lida do DISCO, sem passar pelo daemon.
 *
 * Existe porque a fonte anterior — `prime-agent list --json`, em
 * `agent-tree.ts` — só enxerga sessão que o daemon acompanha, e o prime-desk
 * sobe cada conversa como um `prime-agent --mode rpc` solto, sem
 * `--daemon-socket`. Medido ao vivo: com cinco subagentes reais trabalhando (um
 * deles com `status: "running"` e arquivo tocado 3 segundos antes), o comando
 * devolvia `{"sessions": []}`. O painel não estava quebrado — estava perguntando
 * para quem não tinha como saber.
 *
 * O que o daemon não sabe, o disco sabe. Cada sessão tem
 * `~/.prime/agent/session-artifacts/<id>/`, e dentro dele um `sub-<childId>/`
 * por subagente, com:
 *
 *   rlm-subagent.json   nome, status, modelo e o código que o gerou
 *   <id>.jsonl          o transcript próprio do filho
 *   sub-<childId>       netos, aninhados do mesmo jeito
 *
 * Formato confirmado nos arquivos reais de uma sessão em andamento, não na
 * documentação: `semantic-edges.jsonl` divide o diretório com o transcript e
 * **não** é transcript — daí o filtro por nome.
 */

const SUB_PREFIX = 'sub-'
const EDGES_FILE = 'semantic-edges.jsonl'

interface SubagentMeta {
  sessionName?: string
  sessionFile?: string
  spawnCode?: string
  status?: string
  model?: { modelId?: string }
  updatedAt?: string
  /** Tarefa que o pai encomendou. Estava no arquivo e não era lido. */
  prompt?: string
  /** Epoch ms da criação. Idem — sem ele não há duração. */
  createdAt?: number
}

/** O que se extrai de um transcript. Acumulável: ver `parseTranscript`. */
interface Digest {
  messageCount: number
  firstMessage: string
  lastActivityAt: string
  modelName: string
  cwd: string
  depth: number
  /** Alguém chamou `agent_message.send` — base para "respondeu". */
  sentToParent: boolean
  /**
   * Tarefa vinda do pai.
   *
   * Subagente não tem mensagem de usuário: em 47 de 47 transcripts reais só há
   * `assistant` e `toolResult`, e por isso `firstMessage` ficava sempre vazio.
   * O texto está num `custom_message` com `customType: 'agent_message'`,
   * prefixado por `[task from parent]`.
   */
  taskFromParent: string
  /** Nome da última ferramenta chamada — o "o que está fazendo agora". */
  lastTool: string
  /** Quantas ferramentas rodaram, para o resumo do que já foi feito. */
  toolCount: number
  input: number
  output: number
  cost: number
}

function emptyDigest(): Digest {
  return {
    messageCount: 0, firstMessage: '', lastActivityAt: '', modelName: '',
    cwd: '', depth: 0, sentToParent: false, taskFromParent: '', lastTool: '',
    toolCount: 0, input: 0, output: 0, cost: 0
  }
}

/*
  Cache com leitura incremental.

  O poller relê a árvore a cada 2s com o painel aberto, e transcript de conversa
  longa passa de 200 KB — reler tudo a cada tique seria trabalho jogado fora. O
  arquivo é JSONL só-append, então basta ler o pedaço novo e somar ao que já foi
  contado. Se o arquivo encolher (compactação reescreve), o estado é descartado
  e a leitura recomeça do zero.
*/
interface CacheEntry {
  size: number
  digest: Digest
  /** Sobra sem `\n` no fim da última leitura, para completar a linha depois. */
  partial: string
}
const cache = new Map<string, CacheEntry>()

function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    const b = block as { type?: string; text?: string }
    if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) return b.text.trim()
  }
  return ''
}

interface TranscriptLine {
  type?: string
  cwd?: string
  rlmDepth?: number
  /** Hash do EVENTO. Não é o modelo — ver `model_change` em `applyLine`. */
  id?: string
  modelId?: string
  timestamp?: string
  provider?: string
  customType?: string
  content?: unknown
  message?: {
    role?: string
    toolName?: string
    content?: unknown
    timestamp?: number | string
    usage?: {
      input?: number
      output?: number
      cacheRead?: number
      cacheWrite?: number
      cost?: { total?: number }
    }
  }
}

function applyLine(d: Digest, raw: string): void {
  // Checagem crua antes do parse: barata, e o JSON não precisa ser válido para
  // a intenção estar ali.
  if (!d.sentToParent && raw.includes('agent_message.send')) d.sentToParent = true

  let e: TranscriptLine
  try {
    e = JSON.parse(raw) as TranscriptLine
  } catch {
    return
  }

  if (e.type === 'session') {
    if (typeof e.cwd === 'string') d.cwd = e.cwd
    if (typeof e.rlmDepth === 'number') d.depth = e.rlmDepth
    return
  }
  /*
    `modelId`, não `id`.

    A linha traz os dois — `{"type":"model_change","id":"fd2d437d",…,
    "modelId":"claude-opus-5"}` — e `id` é o hash do evento. Lendo o hash, a
    raiz da árvore exibia "fd2d437d" no lugar do nome do modelo. O subagente
    escapava por acidente, porque `meta.model.modelId` tem precedência sobre o
    digest mais abaixo.
  */
  if (e.type === 'model_change' && typeof e.modelId === 'string') {
    d.modelName = e.modelId
    return
  }

  /* A tarefa que o pai mandou chega como mensagem própria, não como `message`. */
  if (e.type === 'custom_message' && e.customType === 'agent_message') {
    if (!d.taskFromParent) {
      const texto = textOf(e.content)
      d.taskFromParent = texto.replace(/^\[task from parent\]\s*/, '').slice(0, 400)
    }
    return
  }
  if (e.type !== 'message' || !e.message?.role) return

  d.messageCount += 1

  if (!d.firstMessage && e.message.role === 'user') {
    d.firstMessage = textOf(e.message.content).slice(0, 400)
  }

  /*
    `toolResult` carrega `toolName` na própria mensagem, então a última
    ferramenta sai da mesma passada que já monta o digest — sem custo de
    varrer os blocos de `content` de cada mensagem do assistente.
  */
  if (e.message.role === 'toolResult' && typeof e.message.toolName === 'string') {
    d.lastTool = e.message.toolName
    d.toolCount += 1
  }

  const ts = e.message.timestamp
  if (typeof ts === 'number') d.lastActivityAt = new Date(ts).toISOString()
  else if (typeof ts === 'string') d.lastActivityAt = ts

  /*
    Mesma conta que o `sessionUsageSummaryFrom` do prime-agent
    (`core/usage.js`): entrada é `input + cacheRead + cacheWrite`, e o custo é
    `cost.total`. Copiada de lá para o número da GUI não divergir do dele.
  */
  const u = e.message.usage
  if (u) {
    d.input += (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)
    d.output += u.output ?? 0
    d.cost += u.cost?.total ?? 0
  }
}

async function parseTranscript(file: string): Promise<Digest | null> {
  let size: number
  try {
    size = (await stat(file)).size
  } catch {
    return null
  }

  /*
    Tamanho igual significa que nada foi acrescentado — o arquivo é só-append.

    Tentei trocar isto por `>` mais uma comparação de `mtime`, para pegar
    reescrita no lugar que mantivesse o tamanho. Não funciona: a granularidade
    do `mtime` depende do filesystem, e no runner do CI duas escritas seguidas
    caem na mesma marca — o teste que escrevi passava aqui e falhava lá, por
    sorte de relógio. E o caso que ele guardava não existe nesta base: o
    transcript é JSONL só-append, compactação muda o tamanho, e o ramo de
    encolhimento abaixo já cobre isso.
  */
  const prev = cache.get(file)
  const grew = prev !== undefined && size >= prev.size
  const from = grew ? prev.size : 0
  const digest = grew ? prev.digest : emptyDigest()
  let buffer = grew ? prev.partial : ''

  if (size > from) {
    const handle = await open(file, 'r')
    try {
      const chunk = Buffer.alloc(size - from)
      await handle.read(chunk, 0, chunk.length, from)
      buffer += chunk.toString('utf8')
    } finally {
      await handle.close()
    }
  }

  const lines = buffer.split('\n')
  // A última pode estar pela metade: o agente ainda está escrevendo.
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (line.trim()) applyLine(digest, line)
  }

  cache.set(file, { size, digest, partial: buffer })
  return digest
}

function usageOf(d: Digest): AgentNode['usage'] {
  if (d.input === 0 && d.output === 0 && d.cost === 0) return undefined
  return { inputTokens: d.input, outputTokens: d.output, cost: d.cost }
}

/** O transcript do diretório. `semantic-edges.jsonl` não é transcript. */
async function transcriptIn(dir: string): Promise<string | null> {
  try {
    const names = await readdir(dir)
    const found = names.find((n) => n.endsWith('.jsonl') && n !== EDGES_FILE)
    return found ? join(dir, found) : null
  } catch {
    return null
  }
}

/*
  `status` e `updatedAt` mudam; `prompt`, `createdAt`, `spawnCode` e `model`
  não. O arquivo é pequeno e relido a cada tique de 2s por subagente, então o
  que é imutável fica guardado e só os dois campos vivos são relidos.
*/
interface MetaFixo {
  sessionName?: string
  sessionFile?: string
  spawnCode?: string
  model?: { modelId?: string }
  prompt?: string
  createdAt?: number
}
const metaCache = new Map<string, MetaFixo>()

async function readMeta(dir: string): Promise<SubagentMeta> {
  let bruto: SubagentMeta
  try {
    bruto = JSON.parse(await readFile(join(dir, 'rlm-subagent.json'), 'utf8')) as SubagentMeta
  } catch {
    return {}
  }
  if (!metaCache.has(dir)) {
    metaCache.set(dir, {
      sessionName: bruto.sessionName,
      sessionFile: bruto.sessionFile,
      spawnCode: bruto.spawnCode,
      model: bruto.model,
      prompt: bruto.prompt,
      createdAt: bruto.createdAt
    })
  }
  return { ...metaCache.get(dir), status: bruto.status, updatedAt: bruto.updatedAt }
}

async function subDirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith(SUB_PREFIX))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Traduz o status do arquivo de estado para o vocabulário da GUI.
 *
 * Os três valores vistos nos arquivos reais são `running`, `completed` e
 * `deleted`. `deleted` é filho que o pai descartou de propósito depois de usar
 * (`rlm.delete_subagent`) — terminou e foi dispensado, então cai em `done`.
 * Mandá-lo para `idle` faria "acabou e entregou" parecer "está aí sem fazer
 * nada", que é justamente o oposto.
 *
 * Status desconhecido vira `idle`: melhor um nó sem cor forte do que afirmar
 * conclusão que o arquivo não afirma.
 */
/**
 * A partir daqui um `running` parado deixa de ser tratado como vivo.
 *
 * Mesmo número do `NOTICE_AFTER_MS` de `lib/useTurnActivity.ts`, que é quando a
 * interface começa a falar sobre turno silencioso. Os dois não compartilham a
 * constante porque vivem em processos diferentes e `shared/` guarda tipo de
 * protocolo, não limiar de interface — mas o valor é deliberadamente o mesmo:
 * dois números diferentes para "parou de dar sinal" produziriam uma tela que
 * discorda de si mesma.
 */
const ORFAO_APOS_MS = 3 * 60_000

function statusOf(meta: SubagentMeta, ultimaAtividade: string): AgentNode['status'] {
  if (meta.status === 'completed') return 'done'
  // Descartado pelo pai depois de usar (`rlm.delete_subagent`): terminou e foi
  // dispensado. Não é o mesmo que nunca ter começado.
  if (meta.status === 'deleted') return 'ended'
  if (meta.status !== 'running') return 'idle'

  /*
    `running` é o que o ARQUIVO diz, não o que o processo está fazendo. Quando o
    worker morre, ninguém reescreve o arquivo — e o nó girava para sempre, com
    o spinner afirmando atividade que não existe há horas. Sem sinal recente, a
    afirmação cai para ociosa: o dado não sustenta mais o "trabalhando".
  */
  const marca = Date.parse(ultimaAtividade || meta.updatedAt || '')
  if (Number.isNaN(marca)) return 'working'
  return Date.now() - marca > ORFAO_APOS_MS ? 'stale' : 'working'
}

async function readSubagent(
  dir: string,
  name: string,
  parentSessionId: string,
  fallbackDepth: number
): Promise<AgentNode> {
  const meta = await readMeta(dir)
  const file = meta.sessionFile ?? (await transcriptIn(dir))
  const digest = (file ? await parseTranscript(file) : null) ?? emptyDigest()

  const sessionId = file ? basename(file, '.jsonl') : ''

  // Netos são filhos deste nó: o id de pai que eles recebem é o DESTE, não o do
  // avô. A recursão precisa do id já resolvido, por isso ele vem antes.
  const children: AgentNode[] = []
  for (const childName of await subDirs(dir)) {
    children.push(
      await readSubagent(join(dir, childName), childName, sessionId || name, fallbackDepth + 1)
    )
  }

  return {
    activeSessionId: sessionId || name,
    sessionId,
    sessionFile: file ?? '',
    name: meta.sessionName ?? '',
    kind: 'subagent',
    depth: digest.depth || fallbackDepth,
    parentActiveSessionId: parentSessionId,
    rlmChildId: name,
    spawnCode: meta.spawnCode,
    status: statusOf(meta, digest.lastActivityAt),
    taskState: '',
    // Heurística honesta: "respondeu" é ter chamado `agent_message.send`, não
    // apenas ter terminado. Filho pode concluir sem responder ao pai.
    replied: digest.sentToParent,
    hasRunningChildren: children.some((c) => c.status === 'working' || c.hasRunningChildren),
    messageCount: digest.messageCount,
    /*
      Ordem de preferência para a tarefa: o `prompt` do metadado é o texto que
      o pai realmente encomendou; o `[task from parent]` do transcript é o
      mesmo texto já entregue ao filho; `firstMessage` fica por último e, na
      prática, nunca é alcançado num subagente — nenhum dos 47 transcripts
      reais tem mensagem de usuário.
    */
    firstMessage: meta.prompt?.trim().slice(0, 400) || digest.taskFromParent || digest.firstMessage,
    startedAt: meta.createdAt ? new Date(meta.createdAt).toISOString() : undefined,
    lastTool: digest.lastTool || undefined,
    toolCount: digest.toolCount,
    cwd: digest.cwd,
    modelName: meta.model?.modelId ?? digest.modelName,
    lastActivityAt: digest.lastActivityAt || meta.updatedAt || '',
    usage: usageOf(digest),
    source: 'disk',
    children
  }
}

export interface DiskTreeOptions {
  rootSessionId: string
  /** Turno em andamento na ponte: é o que faz a raiz aparecer como ativa. */
  rootBusy?: boolean
  /** Diretórios injetáveis para teste com fixture. */
  sessionsDir?: string
  artifactsDir?: string
}

/**
 * A árvore da conversa que está na tela: raiz + descendentes.
 *
 * `null` só quando não há nem transcript nem diretório de artefatos — sessão
 * que ainda não escreveu nada. Conversa sem subagente devolve a raiz sozinha,
 * de propósito: dizer "0 sessões ativas" enquanto um turno roda era o pior dos
 * dois erros.
 */
export async function readDiskTree(opts: DiskTreeOptions): Promise<AgentNode | null> {
  const sessionsDir = opts.sessionsDir ?? paths.SESSIONS_DIR
  const artifactsDir = opts.artifactsDir ?? paths.ARTIFACTS_DIR

  const file = join(sessionsDir, `${opts.rootSessionId}.jsonl`)
  const dir = join(artifactsDir, opts.rootSessionId)

  const digest = await parseTranscript(file)
  const names = await subDirs(dir)
  if (!digest && names.length === 0) return null

  const d = digest ?? emptyDigest()
  const children: AgentNode[] = []
  for (const name of names) {
    children.push(await readSubagent(join(dir, name), name, opts.rootSessionId, 1))
  }

  return {
    activeSessionId: opts.rootSessionId,
    sessionId: opts.rootSessionId,
    sessionFile: digest ? file : '',
    name: '',
    kind: 'root',
    depth: 0,
    status: opts.rootBusy ? 'working' : 'idle',
    taskState: '',
    replied: false,
    hasRunningChildren: children.some((c) => c.status === 'working' || c.hasRunningChildren),
    messageCount: d.messageCount,
    firstMessage: d.firstMessage,
    lastTool: d.lastTool || undefined,
    toolCount: d.toolCount,
    cwd: d.cwd,
    modelName: d.modelName,
    lastActivityAt: d.lastActivityAt,
    usage: usageOf(d),
    source: 'disk',
    children
  }
}

/** Só para teste: o cache é global e sobreviveria entre casos. */
export function resetDiskTreeCache(): void {
  cache.clear()
  metaCache.clear()
}
