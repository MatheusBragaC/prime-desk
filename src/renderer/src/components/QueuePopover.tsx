import type { RefObject } from 'react'
import { Loader2, Zap, Clock } from 'lucide-react'
import { useAgent, setSteeringMode, setFollowUpMode } from '../store/agent'
import { usePopover } from '../lib/usePopover'
import type { QueueMode } from '../../../shared/protocol'
import { useT } from '../i18n'

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
 */

function Group({ label, items, icon }: {
  label: string
  items: readonly string[]
  icon: React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div className="px-1 pb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-micro uppercase tracking-wider text-dim">
        {icon}
        {label} · {items.length}
      </div>
      {items.map((text, i) => (
        <div
          key={i}
          className="mx-1 mb-0.5 line-clamp-2 rounded bg-white/[0.03] px-2 py-1.5 text-xs leading-snug text-muted"
          title={text}
        >
          {text}
        </div>
      ))}
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
      <div className="flex shrink-0 gap-0.5 rounded-md bg-black/25 p-0.5">
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
  const ref = usePopover<HTMLDivElement>(onClose, true, trigger)

  const actions = state?.sessionActions
  const active = actions?.active
  const steering = actions?.steering ?? []
  const followUps = actions?.followUps ?? []

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-dropdown mb-2 max-h-[340px] w-[320px] overflow-y-auto animate-fade-up rounded-field border border-[var(--p-line)] bg-[var(--p-panel)] py-1.5 shadow-2xl shadow-black/60"
    >
      {active && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
          <Loader2 size={13} strokeWidth={1.75} className="shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate">
            {active.label ??
              (active.kind === 'turn' ? t('queue.activeTurn') : t('queue.activeCommand'))}
            <span className="text-dim"> · {t(`queue.phase.${active.phase}`)}</span>
          </span>
        </div>
      )}

      {/*
        Dois grupos separados: a ordem de entrega entre steer e follow-up não é
        exposta pelo agente, então uma lista única inventaria uma sequência.
      */}
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

      {steering.length === 0 && followUps.length === 0 && !active && (
        <div className="px-3 py-4 text-center text-xs text-dim">{t('queue.empty')}</div>
      )}

      <div className="mt-1 border-t border-[var(--p-line)] pt-1">
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
      </div>

      <p className="border-t border-[var(--p-line)] px-3 pt-1.5 text-micro leading-snug text-dim">
        {t('queue.note')}
      </p>
    </div>
  )
}
