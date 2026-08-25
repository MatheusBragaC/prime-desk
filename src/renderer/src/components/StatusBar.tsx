import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Layers, Target, AlertTriangle, Minimize2, PanelLeft,
  SquareTerminal, FileDiff, FolderTree, GitBranch
} from 'lucide-react'
import { useAgent, compactNow } from '../store/agent'
import { useIsMac, WIN_CONTROLS_WIDTH } from '../lib/platform'
import { fmtCost, fmtTokens } from '../lib/format'
import { useT } from '../i18n'

/** Anel de uso da janela de contexto. Substitui a barrinha de 16px. */
function ContextRing({ pct, size = 15 }: { pct: number; size?: number }) {
  const r = (size - 2.5) / 2
  const c = 2 * Math.PI * r
  const color = pct > 80 ? 'var(--p-error)' : pct > 55 ? 'var(--p-warning)' : 'var(--p-primary)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="2"
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/**
 * Painel de métricas.
 *
 * Tokens, janela de contexto, custo e meta estavam os quatro permanentes na
 * barra de título. São dados de acompanhamento, não de operação: aqui viram um
 * indicador só, que abre sob demanda.
 */
function MetricsPopover({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const state = useAgent((s) => s.state)
  const totals = useAgent((s) => s.totals)
  const compacting = useAgent((s) => s.compacting)
  const ref = useRef<HTMLDivElement>(null)

  const ctx = state?.model?.contextWindow ?? 0
  const pct = ctx > 0 ? Math.min(100, Math.round((totals.tokens / ctx) * 100)) : 0

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  /*
    O rótulo encolhe e trunca; o valor nunca quebra. Sem isso, "Accumulated turn
    tokens" empurrava "0 / 1.00M" para duas linhas dentro dos 248px.
  */
  const row = 'flex items-baseline gap-3 px-3 py-1.5'
  const label = 'min-w-0 flex-1 truncate text-xs text-dim'
  const value = 'shrink-0 whitespace-nowrap font-mono text-sm text-fg'

  return (
    <div
      ref={ref}
      className="no-drag absolute right-0 top-full z-50 mt-1.5 w-[268px] animate-fade-up rounded-field border border-[var(--p-line)] bg-[var(--p-panel)] py-1.5 shadow-2xl shadow-black/60"
    >
      <div className={row}>
        <span className={label} title={t('app.tokensTitle')}>{t('app.tokensTitle')}</span>
        <span className={value}>
          {fmtTokens(totals.tokens)}
          {ctx ? <span className="text-dim"> / {fmtTokens(ctx)}</span> : null}
        </span>
      </div>

      {ctx > 0 && (
        <div className="px-3 pb-1.5 pt-0.5">
          <div className="h-[3px] overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={
                'h-full rounded-full transition-all ' +
                (pct > 80 ? 'bg-err' : pct > 55 ? 'bg-warn' : 'bg-primary')
              }
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-micro text-dim">{pct}% {t('app.contextWindow')}</div>
        </div>
      )}

      <div className={row}>
        <span className={label} title={t('app.costTitle')}>{t('app.costTitle')}</span>
        <span className={value}>{fmtCost(totals.cost)}</span>
      </div>

      {state?.goal?.active && (
        <div className={row}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-dim">
            <Target size={14} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{t('app.goalActive')}</span>
          </span>
          <span className="shrink-0 truncate text-sm text-primarySoft">{state.goal.status}</span>
        </div>
      )}

      <div className="mt-1 border-t border-[var(--p-line)] pt-1">
        <button
          onClick={() => {
            void compactNow()
            onClose()
          }}
          disabled={compacting}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          title={t('app.compactTitle')}
        >
          <Layers size={16} strokeWidth={1.75} />
          {t('app.compact')}
        </button>
      </div>
    </div>
  )
}

export type Dock = 'files' | 'agents' | 'diff' | null

/** Botão da barra de ferramentas: mesma caixa de 28px para todos. */
function ToolButton({
  icon,
  active,
  title,
  badge,
  onClick
}: {
  icon: ReactNode
  active?: boolean
  title: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        'no-drag relative flex h-7 w-7 items-center justify-center rounded-md transition-colors ' +
        (active ? 'bg-elevated text-primarySoft' : 'text-dim hover:bg-elevated hover:text-muted')
      }
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

export function StatusBar({
  onToggleSidebar,
  dock,
  onDock
}: {
  onToggleSidebar?: () => void
  dock: Dock
  onDock: (kind: Exclude<Dock, null>) => void
}) {
  const { t } = useT()
  const isMac = useIsMac()
  const state = useAgent((s) => s.state)
  const totals = useAgent((s) => s.totals)
  const status = useAgent((s) => s.status)
  const compacting = useAgent((s) => s.compacting)
  const retry = useAgent((s) => s.retry)
  const sessions = useAgent((s) => s.sessions)
  const folders = useAgent((s) => s.folders)
  const tree = useAgent((s) => s.tree)
  const [metrics, setMetrics] = useState(false)

  const ctx = state?.model?.contextWindow ?? 0
  const pct = ctx > 0 ? Math.min(100, Math.round((totals.tokens / ctx) * 100)) : 0

  const title = useMemo(() => {
    const id = state?.sessionId
    if (!id) return ''
    return folders.titles?.[id] ?? sessions.find((s) => s.id === id)?.title ?? ''
  }, [state?.sessionId, sessions, folders.titles])

  const dot =
    status === 'ready' ? (state?.isStreaming ? 'bg-primary animate-pulse-soft' : 'bg-ok/70')
    : status === 'error' ? 'bg-err'
    : 'bg-warn animate-pulse-soft'

  /* Com tudo em ordem, o rótulo de estado é ruído: só o ponto permanece. */
  const stateLabel =
    status === 'ready'
      ? state?.isStreaming
        ? t('app.running')
        : null
      : status === 'starting'
        ? t('app.starting')
        : status === 'error'
          ? t('app.error')
          : t('app.disconnected')

  return (
    /*
      Sem `border-b`: a separação do palco vem do tom, não de uma linha. Reserva
      à direita só onde os botões de janela são desenhados no conteúdo
      (Windows/Linux). No macOS eles estão à esquerda, na sidebar.
    */
    <div
      className="drag-region relative z-20 flex h-[var(--p-titlebar)] shrink-0 items-center gap-2.5 pl-4"
      style={{ paddingRight: isMac ? 16 : WIN_CONTROLS_WIDTH }}
    >
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="no-drag -ml-1 rounded-md p-1.5 text-dim transition-colors hover:bg-elevated hover:text-fg"
          title={t('sidebar.toggle')}
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </button>
      )}

      <span
        className={`h-[6px] w-[6px] shrink-0 rounded-full ${dot}`}
        title={stateLabel ?? t('app.ready')}
      />

      {stateLabel ? (
        <span className="shrink-0 text-sm text-muted">{stateLabel}</span>
      ) : (
        <span className="min-w-0 truncate text-sm text-muted" title={title}>
          {title}
        </span>
      )}

      {retry && (
        <div className="no-drag flex shrink-0 items-center gap-1.5 text-xs text-warn">
          <AlertTriangle size={14} strokeWidth={1.75} />
          {t('app.retry')} {retry.attempt}/{retry.max}
        </div>
      )}

      {compacting && (
        <div className="no-drag flex shrink-0 items-center gap-1.5 text-xs text-info">
          <Minimize2 size={14} strokeWidth={1.75} className="animate-pulse-soft" />
          {t('app.compacting')}
        </div>
      )}

      <div className="flex-1" />

      {/*
        Barra de ferramentas: terminal, alterações, arquivos e agentes. Ficavam
        espalhados — o terminal só no onboarding, a árvore num canto da sidebar,
        os arquivos num chip do composer. Juntos, viram um lugar só de "abrir
        alguma coisa sobre o workspace".
      */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          icon={<SquareTerminal size={16} strokeWidth={1.75} />}
          title={t('toolbar.terminal')}
          onClick={() => void window.prime.openAgentTerminal()}
        />
        <ToolButton
          icon={<FileDiff size={16} strokeWidth={1.75} />}
          title={t('toolbar.diff')}
          active={dock === 'diff'}
          onClick={() => onDock('diff')}
        />
        <ToolButton
          icon={<FolderTree size={16} strokeWidth={1.75} />}
          title={t('toolbar.files')}
          active={dock === 'files'}
          onClick={() => onDock('files')}
        />
        <ToolButton
          icon={<GitBranch size={16} strokeWidth={1.75} />}
          title={t('toolbar.agents')}
          active={dock === 'agents'}
          badge={tree?.subagents}
          onClick={() => onDock('agents')}
        />
      </div>

      <div className="relative">
        <button
          onClick={() => setMetrics((v) => !v)}
          className={
            'no-drag flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-elevated ' +
            (metrics ? 'bg-elevated text-fg' : 'text-dim')
          }
          title={t('app.tokensTitle')}
        >
          <ContextRing pct={pct} />
          <span className="font-mono text-xs">{fmtTokens(totals.tokens)}</span>
        </button>
        {metrics && <MetricsPopover onClose={() => setMetrics(false)} />}
      </div>
    </div>
  )
}
