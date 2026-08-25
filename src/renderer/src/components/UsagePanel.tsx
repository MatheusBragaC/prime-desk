import type { UsageStats } from '../../../shared/protocol'
import { fmtCost, fmtCount, fmtHour } from '../lib/format'
import { t, useT } from '../i18n'

/**
 * Painel de uso agregado.
 *
 * Vivia dentro da tela inicial, e por isso a primeira coisa que o app mostrava
 * era um dashboard. Extraído para abrir sob demanda: os números continuam
 * inteiros, mas param de disputar a atenção com o campo de escrever.
 */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card bg-[var(--p-surface)] px-3 py-2">
      <div className="text-micro uppercase tracking-wider text-dim">{label}</div>
      <div
        title={value}
        className={
          'mt-0.5 truncate font-mono text-base leading-tight ' +
          (accent ? 'text-primarySoft' : 'text-fg')
        }
      >
        {value}
      </div>
    </div>
  )
}

/** Escala em 5 níveis, relativa ao dia mais ativo. */
function level(count: number, max: number): string {
  if (count === 0) return 'bg-white/[0.05]'
  const r = count / Math.max(1, max)
  if (r > 0.66) return 'bg-primary'
  if (r > 0.4) return 'bg-primary/70'
  if (r > 0.18) return 'bg-primary/45'
  return 'bg-primary/25'
}

function Heatmap({ days }: { days: UsageStats['days'] }) {
  const WEEKDAYS = t('usage.weekdays').split(',')
  if (days.length === 0) return null
  const max = Math.max(...days.map((d) => d.count))

  // O primeiro dia raramente cai num domingo: as células vazias alinham a grade.
  const pad = new Date(days[0].day + 'T00:00:00').getDay()
  const cells: (UsageStats['days'][number] | null)[] = [...new Array(pad).fill(null), ...days]
  const weeks: (UsageStats['days'][number] | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="flex gap-1.5">
      <div className="flex flex-col gap-[3px] pt-[1px]">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="h-[11px] text-[8px] leading-[11px] text-dim">
            {i % 2 === 1 ? d : ''}
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {new Array(7).fill(null).map((_, di) => {
              const cell = week[di]
              if (!cell) return <div key={di} className="h-[11px] w-[11px]" />
              return (
                <div
                  key={di}
                  title={`${cell.day}: ${t('usage.dayMessages', { n: cell.count })}`}
                  className={`h-[11px] w-[11px] rounded-[2px] ${level(cell.count, max)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tokens estimados de um livro inteiro, base da comparação exibida. */
const BOOK_TOKENS = 89_000

export function UsagePanel({ stats }: { stats: UsageStats }) {
  const { t, lang } = useT()

  return (
    <div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        <Stat label={t('usage.sessions')} value={fmtCount(stats.sessions, lang)} />
        <Stat label={t('usage.messages')} value={fmtCount(stats.messages, lang)} />
        <Stat label={t('usage.totalTokens')} value={fmtCount(stats.tokens, lang)} accent />
        <Stat label={t('usage.activeDays')} value={String(stats.activeDays)} />
        <Stat label={t('usage.currentStreak')} value={`${stats.currentStreak}d`} />
        <Stat label={t('usage.longestStreak')} value={`${stats.longestStreak}d`} />
        <Stat
          label={t('usage.peakHour')}
          value={stats.peakHour >= 0 ? fmtHour(stats.peakHour, lang) : '—'}
        />
        <Stat label={t('usage.favorite')} value={stats.favoriteModel || '—'} />
      </div>

      <Heatmap days={stats.days} />

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-xs text-dim" title={t('usage.compareBasis')}>
          {t('usage.compare', { n: Math.round(stats.tokens / BOOK_TOKENS).toLocaleString() })}
        </span>
        <span className="font-mono text-xs text-muted">
          {t('usage.costFooter')} {fmtCost(stats.cost)}
        </span>
      </div>

      <p className="mt-2 border-t border-[var(--p-line)] pt-2 text-micro leading-snug text-dim">
        {t('usage.source')}
      </p>
    </div>
  )
}
