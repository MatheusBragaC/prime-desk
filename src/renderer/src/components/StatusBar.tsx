import { Activity, Coins, Layers, Target, AlertTriangle, Minimize2 } from 'lucide-react'
import { useAgent, compactNow } from '../store/agent'
import { fmtCost, fmtTokens } from '../lib/format'

export function StatusBar() {
  const state = useAgent((s) => s.state)
  const totals = useAgent((s) => s.totals)
  const status = useAgent((s) => s.status)
  const compacting = useAgent((s) => s.compacting)
  const retry = useAgent((s) => s.retry)

  const ctx = state?.model?.contextWindow ?? 0
  const pct = ctx > 0 ? Math.min(100, Math.round((totals.tokens / ctx) * 100)) : 0

  const dot =
    status === 'ready' ? (state?.isStreaming ? 'bg-primary animate-pulse-soft' : 'bg-ok')
    : status === 'error' ? 'bg-err'
    : 'bg-warn animate-pulse-soft'

  return (
    // pr-[150px]: reserva espaço para os controles nativos da janela (titleBarOverlay)
    <div className="drag-region flex h-[var(--p-titlebar)] shrink-0 items-center gap-4 border-b border-white/[0.06] pl-5 pr-[150px]">
      <div className="no-drag flex items-center gap-2">
        <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
        <span className="text-[12px] text-muted">
          {status === 'ready'
            ? state?.isStreaming ? 'Executando' : 'Pronto'
            : status === 'starting' ? 'Iniciando'
            : status === 'error' ? 'Erro'
            : 'Desconectado'}
        </span>
      </div>

      {retry && (
        <div className="no-drag flex items-center gap-1.5 text-[11.5px] text-warn">
          <AlertTriangle size={12} />
          Retry {retry.attempt}/{retry.max}
        </div>
      )}

      {compacting && (
        <div className="no-drag flex items-center gap-1.5 text-[11.5px] text-info">
          <Minimize2 size={12} className="animate-pulse-soft" />
          Compactando contexto
        </div>
      )}

      <div className="flex-1" />

      {state?.goal?.active && (
        <div className="no-drag flex items-center gap-1.5 text-[11.5px] text-primarySoft" title="Goal ativo">
          <Target size={12} />
          {state.goal.status}
        </div>
      )}

      <div className="no-drag flex items-center gap-1.5 font-mono text-[11.5px] text-dim" title="Tokens do turno acumulados">
        <Activity size={12} />
        {fmtTokens(totals.tokens)}
        {ctx ? <span className="text-grid">/ {fmtTokens(ctx)}</span> : null}
      </div>

      {ctx > 0 && (
        <div className="no-drag h-1 w-16 overflow-hidden rounded-full bg-white/[0.08]" title={`${pct}% da janela`}>
          <div
            className={'h-full rounded-full transition-all ' + (pct > 80 ? 'bg-err' : pct > 55 ? 'bg-warn' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="no-drag flex items-center gap-1.5 font-mono text-[11.5px] text-dim" title="Custo acumulado da sessão">
        <Coins size={12} />
        {fmtCost(totals.cost)}
      </div>

      <button
        onClick={() => void compactNow()}
        disabled={compacting}
        className="no-drag flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] text-dim transition-colors hover:bg-white/[0.06] hover:text-muted disabled:opacity-40"
        title="Compactar contexto agora"
      >
        <Layers size={12} />
        Compactar
      </button>
    </div>
  )
}
