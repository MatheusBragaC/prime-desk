import type { RefObject } from 'react'
import { useEffect } from 'react'
import { Loader2, Zap, Clock, Bot, GitBranch, ChevronRight } from 'lucide-react'
import { useAgent, setSteeringMode, setFollowUpMode, refreshTree } from '@/store/agent'
import { usePopover } from '@/lib/usePopover'
import { parseQueueItem, countWorking } from '@/lib/agentMessage'
import type { QueueMode } from '@shared/protocol'
import { useT } from '@/i18n'

/**
 * Conteúdo da fila de mensagens.
 *
 * O app só mostrava um contador — os textos enfileirados chegavam em
 * `sessionActions` desde sempre, mas estavam tipados como `unknown[]`, então
 * ninguém sabia que dava para exibi-los.
 *
 * Somente leitura por limitação do agente, não por escolha: o RPC não tem
 * comando para remover ou reordenar item (`abort_and_clear_queue` existe apenas
 * no protocolo interno do daemon). Melhor dizer isso do que oferecer um botão
 * que não vai funcionar.
 *
 * Boa parte do que cai aqui não foi digitado por ninguém: são subagentes
 * devolvendo relatório. Isso chegava como texto cru começando por "Agent
 * message received", com o rótulo em inglês comendo o início de cada linha —
 * então quem olhava a fila via o rótulo, não o conteúdo. Agora item de agente é
 * reconhecido, o rótulo vira marca, e o painel diz quantos agentes estão
 * trabalhando, com atalho para a árvore.
 *
 * Layout em três faixas — cabeçalho, lista rolável, controles — em vez de uma
 * caixa rolável só. Com a caixa única, dois relatórios de subagente (que vêm
 * com caminho de arquivo inteiro) já empurravam os interruptores de modo e o
 * aviso de "somente leitura" para fora da vista: a pessoa via a fila mas perdia
 * os controles dela.
 */

function Group({ label, items, icon }: {
  label: string
  items: readonly string[]
  icon: React.ReactNode
}) {
  const { t } = useT()
  if (items.length === 0) return null
  return (
    <div className="px-1 pb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-micro uppercase tracking-wider text-dim">
        {icon}
        {label} · {items.length}
      </div>
      {items.map((text, i) => {
        const item = parseQueueItem(text)
        return (
          <div
            key={i}
            className="mx-1 mb-0.5 rounded bg-raise px-2 py-1.5"
            title={text}
          >
            {item.fromAgent && (
              <div className="mb-0.5 flex items-center gap-1 text-micro text-primarySoft">
                <Bot size={11} strokeWidth={1.75} className="shrink-0" />
                <span className="min-w-0 truncate">{item.from ?? t('queue.fromAgent')}</span>
              </div>
            )}
            {/*
              `break-words` porque relatório de subagente costuma ser um caminho
              absoluto sem espaço nenhum: sem isso o texto não quebra, estoura a
              largura e é cortado no meio, sem nem reticências.
            */}
            <div className="line-clamp-3 break-words text-xs leading-snug text-muted">
              {item.body}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModeToggle({ label, value, onChange }: {
  label: string
  value: QueueMode
  onChange: (m: QueueMode) => void
}) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-dim">{label}</span>
      <div className="flex shrink-0 gap-0.5 rounded-md bg-well p-0.5">
        {(['one-at-a-time', 'all'] as QueueMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={
              'rounded px-1.5 py-0.5 text-micro transition-colors ' +
              (value === m ? 'bg-elevated text-fg' : 'text-dim hover:text-muted')
            }
          >
            {m === 'all' ? t('queue.modeAll') : t('queue.modeOne')}
          </button>
        ))}
      </div>
    </div>
  )
}

export function QueuePopover({ onClose, trigger }: {
  onClose: () => void
  trigger: RefObject<HTMLElement | null>
}) {
  const { t } = useT()
  const state = useAgent((s) => s.state)
  const tree = useAgent((s) => s.tree)
  const requestDock = useAgent((s) => s.requestDock)
  const ref = usePopover<HTMLDivElement>(onClose, true, trigger)

  /*
    Um ciclo da árvore ao abrir. O poller fica desligado em repouso (App.tsx
    decide o ritmo por `dock`/`streaming`), então sem isto a linha de agentes
    ficaria com o último número visto — ou ausente — justamente depois de um
    turno terminar, quando os relatórios ainda estão na fila.
  */
  useEffect(() => {
    void refreshTree()
  }, [])

  const working = countWorking(tree)
  const subagents = tree?.subagents ?? 0

  const actions = state?.sessionActions
  const active = actions?.active
  const steering = actions?.steering ?? []
  const followUps = actions?.followUps ?? []
  const nothing = steering.length === 0 && followUps.length === 0 && !active

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-dropdown mb-2 flex max-h-[min(440px,70vh)] w-[320px] flex-col animate-fade-up rounded-field border border-[var(--p-line)] bg-[var(--p-panel)] shadow-2xl shadow-drop"
    >
      {(subagents > 0 || active) && (
        <div className="shrink-0 border-b border-[var(--p-line)] py-1.5">
          {subagents > 0 && (
            <button
              onClick={() => {
                requestDock('agents')
                onClose()
              }}
              className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <GitBranch size={13} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
              <span className="min-w-0 flex-1">
                {working > 0
                  ? t('queue.agentsWorking', { working, total: subagents })
                  : t('queue.agentsIdle', { total: subagents })}
              </span>
              <ChevronRight size={13} strokeWidth={1.75} className="shrink-0 text-dim" />
            </button>
          )}

          {active && (
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted">
              <Loader2
                size={13}
                strokeWidth={1.75}
                className="shrink-0 animate-spin text-primary"
              />
              <span className="min-w-0 flex-1 truncate">
                {active.label ??
                  (active.kind === 'turn' ? t('queue.activeTurn') : t('queue.activeCommand'))}
                <span className="text-dim"> · {t(`queue.phase.${active.phase}`)}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Só a lista rola: cabeçalho e controles ficam sempre à vista. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <Group
          label={t('queue.steering')}
          items={steering}
          icon={<Zap size={12} strokeWidth={1.75} />}
        />
        <Group
          label={t('queue.followUps')}
          items={followUps}
          icon={<Clock size={12} strokeWidth={1.75} />}
        />

        {nothing && (
          <div className="px-3 py-4 text-center text-xs text-dim">{t('queue.empty')}</div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--p-line)] py-1">
        <ModeToggle
          label={t('queue.steeringMode')}
          value={state?.steeringMode ?? 'one-at-a-time'}
          onChange={(m) => void setSteeringMode(m)}
        />
        <ModeToggle
          label={t('queue.followUpMode')}
          value={state?.followUpMode ?? 'one-at-a-time'}
          onChange={(m) => void setFollowUpMode(m)}
        />
        <p className="mt-1 border-t border-[var(--p-line)] px-3 pt-1.5 text-micro leading-snug text-dim">
          {t('queue.note')}
        </p>
      </div>
    </div>
  )
}
