import { useMemo, useState } from 'react'
import { ChevronRight, CornerDownRight, Code2, RefreshCw, Eye, Radio } from 'lucide-react'
import { IconAgents } from '@/icons'
import type { AgentNode, AgentTreeSnapshot } from '@shared/protocol'
import { useAgent, observeSession } from '@/store/agent'
import { Butterfly } from './Butterfly'
import { StatusIcon, estadoDe, type EstadoVisual } from './ui/StatusIcon'
import { relTime, fmtTokens, fmtCost, fmtElapsed } from '@/lib/format'
import { sumTreeUsage } from '@/lib/agentUsage'
import { countWorking } from '@/lib/agentMessage'
import { DockPanel } from './DockPanel'
import { PanelEmpty, PanelError } from './PanelState'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'

/*
  Recuo para no nível 2.

  Com 15px por degrau e a maior árvore real medida — 24 subagentes em 3 níveis —
  o quarto nível consumia 68 dos 310px do painel só de margem esquerda. Daí em
  diante a profundidade vira etiqueta, que ocupa largura constante.
*/
const RECUO_POR_NIVEL = 15
const NIVEL_MAXIMO_COM_RECUO = 2

type Filtro = 'todos' | 'trabalhando' | 'concluidos' | 'problemas'

/** Estados que cada filtro admite. `todos` não filtra. */
const NO_FILTRO: Record<Exclude<Filtro, 'todos'>, EstadoVisual[]> = {
  trabalhando: ['working'],
  concluidos: ['done'],
  problemas: ['mute', 'stale']
}

function contaPorFiltro(no: AgentNode, filtro: Exclude<Filtro, 'todos'>): number {
  const proprio = no.kind === 'subagent' && NO_FILTRO[filtro].includes(estadoDe(no)) ? 1 : 0
  return proprio + no.children.reduce((a, c) => a + contaPorFiltro(c, filtro), 0)
}

/** Descendentes trabalhando, sem contar o próprio nó. */
function ativosDentro(no: AgentNode): number {
  return no.children.reduce(
    (a, c) => a + (c.status === 'working' ? 1 : 0) + ativosDentro(c),
    0
  )
}

/** O nó passa, ou algum descendente passa — senão o filho apareceria sem pai. */
function alcancadoPor(no: AgentNode, filtro: Filtro): boolean {
  if (filtro === 'todos') return true
  if (NO_FILTRO[filtro].includes(estadoDe(no))) return true
  return no.children.some((c) => alcancadoPor(c, filtro))
}

/**
 * Quanto tempo o nó levou, ou leva.
 *
 * Concluído mede do início à última atividade; em curso, do início até agora.
 * Sem `startedAt` não há duração — o `createdAt` só existe para subagente, e
 * inventar um começo a partir da primeira mensagem daria número errado para
 * quem passou tempo na fila.
 */
function duracao(no: AgentNode): string {
  if (!no.startedAt) return ''
  const inicio = Date.parse(no.startedAt)
  if (Number.isNaN(inicio)) return ''
  const fim =
    no.status === 'working' ? Date.now() : Date.parse(no.lastActivityAt || '') || Date.now()
  return fmtElapsed(Math.max(0, fim - inicio))
}

function Node({
  node,
  level,
  filtro,
  fechados,
  alternar
}: {
  node: AgentNode
  level: number
  filtro: Filtro
  fechados: Record<string, boolean>
  alternar: (id: string) => void
}) {
  const { t, lang } = useT()
  const [showCode, setShowCode] = useState(false)
  const watching = useAgent((s) => Boolean(s.observed[node.activeSessionId]))

  const hasChildren = node.children.length > 0
  const filtrando = filtro !== 'todos'
  /*
    Com filtro ligado a árvore abre inteira: manter o colapso esconderia
    justamente o nó que o filtro foi buscar, e o chevron passaria a afirmar um
    estado que não vale. Ele some enquanto o filtro estiver ligado.
  */
  const fechado = filtrando ? false : Boolean(fechados[node.activeSessionId])
  const proprio = filtro === 'todos' || NO_FILTRO[filtro].includes(estadoDe(node))

  const estado = estadoDe(node)
  const label =
    node.name || (node.kind === 'root' ? t('tree.rootName') : node.rlmChildId || 'subagent')

  const escondidosTrabalhando = fechado ? ativosDentro(node) : 0
  const nivelVisual = Math.min(level, NIVEL_MAXIMO_COM_RECUO)
  const dur = duracao(node)

  const filhos = hasChildren && !fechado
    ? node.children.filter((c) => alcancadoPor(c, filtro))
    : []

  return (
    <div>
      <div
        className={
          'group flex items-start gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover ' +
          // Ancestral mantido só para dar pai ao filho que o filtro achou.
          (proprio ? '' : 'opacity-55')
        }
        style={{ paddingLeft: 8 + nivelVisual * RECUO_POR_NIVEL }}
      >
        <div className="relative mt-[3px] shrink-0">
          <button
            onClick={() => alternar(node.activeSessionId)}
            disabled={!hasChildren || filtrando}
            aria-label={fechado ? t('tree.expandAll') : t('tree.collapseAll')}
            className="block disabled:opacity-0"
          >
            <ChevronRight
              size={14} strokeWidth={1.75}
              className={'text-dim transition-transform duration-200 ' + (fechado ? '' : 'rotate-90')}
            />
          </button>
          {/*
            `hasRunningChildren` era calculado no processo principal e não tinha
            um único consumidor no renderer: pai fechado com filho trabalhando
            ficava idêntico a pai fechado e parado.
          */}
          {escondidosTrabalhando > 0 && (
            <span
              title={t('tree.insideWorking', { n: escondidosTrabalhando })}
              className="absolute -bottom-px -right-0.5 h-[5px] w-[5px] animate-pulse-soft rounded-full bg-primary ring-2 ring-[var(--p-panel)]"
            />
          )}
        </div>

        {level === 0 ? (
          <Butterfly size={13} className="mt-[3px] shrink-0" />
        ) : (
          <CornerDownRight size={14} strokeWidth={1.75} className="mt-[3px] shrink-0 text-grid" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusIcon estado={estado} />
            {level > NIVEL_MAXIMO_COM_RECUO && (
              <span className="shrink-0 rounded bg-chip px-1 font-mono text-micro text-grid">
                d{node.depth}
              </span>
            )}
            <span className="truncate text-sm text-fg">{label}</span>

            {dur && (
              <span className="ml-auto shrink-0 font-mono text-micro text-dim">{dur}</span>
            )}

            {/*
              O botão de acompanhar depende do `activeSessionId` que só o daemon
              tem: `observe` é comando de RPC e não aceita o id de arquivo. Nó
              lido do disco não tem esse id, então em vez de oferecer um botão
              que falha, ele não aparece.
            */}
            {node.source === 'disk' ? null : watching ? (
              <span className="flex shrink-0 items-center gap-1 text-micro text-ok">
                <Radio size={12} strokeWidth={1.75} className="animate-pulse-soft" />
                {t('tree.watching')}
              </span>
            ) : (
              <button
                onClick={() => void observeSession(node.activeSessionId, label)}
                className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-primarySoft focus-visible:opacity-100 group-hover:opacity-100"
                title={t('tree.watch')}
                aria-label={t('tree.watch')}
              >
                <Eye size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/*
            A tarefa que o pai encomendou. Vinha sempre vazia porque subagente
            não tem mensagem de usuário; agora sai do `prompt` do metadado.
          */}
          {node.firstMessage && (
            <div className="mt-1 line-clamp-2 text-xs leading-snug text-muted">
              {node.firstMessage}
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 text-micro text-dim">
            {/* O que está fazendo AGORA — só faz sentido enquanto roda. */}
            {estado === 'working' && node.lastTool && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-primarySoft">
                <span className="h-1 w-1 animate-pulse-soft rounded-full bg-primary" />
                {node.lastTool}
              </span>
            )}
            {/*
              Rótulo só onde o glifo não basta. O check verde já diz "concluiu"
              e o badge de espera já existe; "sem responder", "sem sinal" e
              "encerrado" são os que ninguém adivinha pelo desenho.
            */}
            {(estado === 'mute' || estado === 'stale' || estado === 'ended') && (
              <span className="shrink-0">{t(`tree.state.${estado}`)}</span>
            )}
            {estado === 'waiting' && <span className="shrink-0 text-info">{t('tree.waiting')}</span>}
            {node.toolCount ? <span>{t('tree.steps', { n: node.toolCount })}</span> : null}
            {node.modelName && <span className="truncate">{node.modelName}</span>}
            {node.lastActivityAt && <span className="shrink-0">{relTime(node.lastActivityAt, lang)}</span>}

            {/*
              Gasto próprio do nó — `usage` vem ausente (não zero) em versão do
              prime-agent que não relata isso, ou sessão que ainda não gastou
              nada real. Título completo com os dois lados (entrada/saída)
              porque o número compacto do lado de fora não cabe os dois.
            */}
            {node.usage ? (
              <span
                className="ml-auto shrink-0 font-mono text-primarySoft/80"
                title={t('tree.usageDetail', {
                  input: fmtTokens(node.usage.inputTokens),
                  output: fmtTokens(node.usage.outputTokens)
                })}
              >
                {fmtCost(node.usage.cost)}
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-grid">{t('tree.noCost')}</span>
            )}
          </div>

          {node.spawnCode && (
            <>
              <button
                onClick={() => setShowCode((v) => !v)}
                className="mt-1 flex items-center gap-1 text-micro text-dim transition-colors hover:text-muted"
              >
                <Code2 size={12} strokeWidth={1.75} />
                {showCode ? t('tree.hideSpawn') : t('tree.showSpawn')}
              </button>
              {showCode && (
                <pre className="mt-1 max-h-32 animate-fade-up overflow-auto rounded-md border border-[var(--p-line)] bg-codeBg p-2 font-mono text-micro leading-relaxed text-mint">
                  {node.spawnCode.trim()}
                </pre>
              )}
            </>
          )}
        </div>
      </div>

      {filhos.length > 0 && (
        <div
          className="border-l border-[var(--p-line)]"
          style={{ marginLeft: 14 + nivelVisual * RECUO_POR_NIVEL }}
        >
          {filhos.map((c) => (
            <Node
              key={c.activeSessionId}
              node={c}
              level={level + 1}
              filtro={filtro}
              fechados={fechados}
              alternar={alternar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Ordena por atividade recente. A ordem do disco é `readdir().sort()`, ou seja,
 *  alfabética por hash — aleatória para quem olha. */
function porAtividade(snapshot: AgentTreeSnapshot): AgentNode[] {
  const ordena = (nodes: AgentNode[]): AgentNode[] =>
    [...nodes]
      .sort((a, b) => (Date.parse(b.lastActivityAt || '') || 0) - (Date.parse(a.lastActivityAt || '') || 0))
      .map((n) => ({ ...n, children: ordena(n.children) }))
  return ordena(snapshot.roots)
}

function todosOsIds(nodes: AgentNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length > 0) into.push(n.activeSessionId)
    todosOsIds(n.children, into)
  }
  return into
}

export function AgentTree({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const tree = useAgent((s) => s.tree)
  const error = useAgent((s) => s.treeError)
  const usage = sumTreeUsage(tree)

  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [fechados, setFechados] = useState<Record<string, boolean>>({})

  const raizes = useMemo(() => (tree ? porAtividade(tree) : []), [tree])
  const contagens = useMemo(() => {
    const soma = (f: Exclude<Filtro, 'todos'>) => raizes.reduce((a, r) => a + contaPorFiltro(r, f), 0)
    return { trabalhando: soma('trabalhando'), concluidos: soma('concluidos'), problemas: soma('problemas') }
  }, [raizes])

  const alternar = (id: string) =>
    setFechados((atual) => ({ ...atual, [id]: !atual[id] }))

  const comFilhos = todosOsIds(raizes)
  const tudoFechado = comFilhos.length > 0 && comFilhos.every((id) => fechados[id])
  const alternarTudo = () =>
    setFechados(tudoFechado ? {} : Object.fromEntries(comFilhos.map((id) => [id, true])))

  const chips: { id: Filtro; rotulo: string }[] = [
    { id: 'todos', rotulo: t('tree.filterAll') },
    { id: 'trabalhando', rotulo: t('tree.filterWorking', { n: contagens.trabalhando }) },
    { id: 'concluidos', rotulo: t('tree.filterDone', { n: contagens.concluidos }) },
    { id: 'problemas', rotulo: t('tree.filterProblems', { n: contagens.problemas }) }
  ]

  return (
    <DockPanel
      storageKey="agent-tree"
      defaultWidth={310}
      min={240}
      max={680}
      icon={<IconAgents className="text-primarySoft" />}
      title={t('tree.title')}
      onClose={onClose}
      bodyClassName="min-h-0 flex-1 overflow-y-auto py-1.5"
      actions={
        <>
          {comFilhos.length > 0 && (
            <Button
              size="sm"
              onClick={alternarTudo}
              className="no-drag px-0 py-0 text-micro font-normal"
            >
              {tudoFechado ? t('tree.expandAll') : t('tree.collapseAll')}
            </Button>
          )}
          <button
            onClick={() => void window.prime.refreshAgentTree()}
            className="no-drag text-dim transition-colors hover:text-muted"
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
        </>
      }
      subheader={
        <div className="border-b border-[var(--p-line)]">
          <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-2 text-xs text-dim">
            <span className="min-w-0 truncate">
              {tree
                ? t('tree.summary', { subs: tree.subagents, working: countWorking(tree) })
                : t('common.loading')}
            </span>
            {/* Soma de TODA a árvore — o número que faltava depois do incidente
                do Gnexum, onde três subagentes rodaram e não dava pra saber
                quanto cada um, nem o total, tinha custado. */}
            {usage && (
              <span
                className="shrink-0 font-mono text-primarySoft"
                title={t('tree.usageDetail', {
                  input: fmtTokens(usage.inputTokens),
                  output: fmtTokens(usage.outputTokens)
                })}
              >
                {fmtCost(usage.cost)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {chips.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={filtro === c.id ? 'accent' : 'outline'}
                onClick={() => setFiltro(c.id)}
                className="rounded-md px-2 py-0.5 text-micro"
              >
                {c.rotulo}
              </Button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="border-t border-[var(--p-line)] px-4 py-2.5 text-micro leading-snug text-dim">
          {t('tree.note')}
        </div>
      }
    >
      {error && <PanelError message={error} />}
      {raizes.length === 0 && !error && <PanelEmpty message={t('tree.none')} />}
      {raizes
        .filter((r) => alcancadoPor(r, filtro))
        .map((r) => (
          <Node
            key={r.activeSessionId}
            node={r}
            level={0}
            filtro={filtro}
            fechados={fechados}
            alternar={alternar}
          />
        ))}
    </DockPanel>
  )
}
