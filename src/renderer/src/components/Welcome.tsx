import { useEffect, useState } from 'react'
import { Butterfly } from './Butterfly'
import type { UsageStats } from '../../../shared/protocol'
import { fmtCost, fmtTokens } from '../lib/format'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--p-surface)] px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-dim">{label}</div>
      <div
        className={
          'mt-0.5 font-mono text-[15px] leading-tight ' + (accent ? 'text-primarySoft' : 'text-fg')
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
  if (days.length === 0) return null
  const max = Math.max(...days.map((d) => d.count))

  // Alinha a primeira coluna ao domingo para as linhas baterem com os rótulos.
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
                  title={`${cell.day}: ${cell.count} mensagem(ns)`}
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

export function Welcome() {
  const [stats, setStats] = useState<UsageStats | null>(null)

  useEffect(() => {
    let alive = true
    void window.prime.usageStats().then((r) => {
      if (alive && r?.ok) setStats(r.stats as UsageStats)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="animate-fade-up flex flex-col items-center">
        <Butterfly size={44} />
        <h1 className="mt-3 text-[21px] font-semibold tracking-tight">Prime Desk</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Interface gráfica para o <span className="font-mono text-primarySoft">prime-agent</span>
        </p>
      </div>

      {stats && stats.sessions > 0 && (
        <div
          className="animate-fade-up mt-7 w-full max-w-[560px] rounded-xl border border-white/[0.07] bg-black/20 p-4"
          style={{ animationDelay: '80ms' }}
        >
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Sessões" value={String(stats.sessions)} />
            <Stat label="Mensagens" value={stats.messages.toLocaleString('pt-BR')} />
            <Stat label="Tokens" value={fmtTokens(stats.tokens)} accent />
            <Stat label="Custo total" value={fmtCost(stats.cost)} />
            <Stat label="Dias ativos" value={String(stats.activeDays)} />
            <Stat label="Sequência" value={`${stats.currentStreak} d`} />
          </div>

          <Heatmap days={stats.days} />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim">
            {stats.favoriteModel && (
              <span>
                Modelo mais usado <span className="text-muted">{stats.favoriteModel}</span>
              </span>
            )}
            {stats.peakHour >= 0 && (
              <span>
                Pico às{' '}
                <span className="text-muted">{String(stats.peakHour).padStart(2, '0')}h</span>
              </span>
            )}
            <span>
              Maior sequência <span className="text-muted">{stats.longestStreak} d</span>
            </span>
          </div>
        </div>
      )}

      {stats && stats.sessions === 0 && (
        <p className="mt-6 text-[13px] text-dim">Nenhuma conversa ainda. Comece abaixo.</p>
      )}
    </div>
  )
}
