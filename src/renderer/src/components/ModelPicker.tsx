import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Brain, Cpu } from 'lucide-react'
import { useAgent, setModel, setThinking } from '../store/agent'
import { THINKING_LEVELS, type ThinkingLevel } from '../../../shared/protocol'
import { t, useT } from '../i18n'

const thinkingLabel = (l: ThinkingLevel): string => t(`thinking.${l}`)

const THINKING_COLOR: Record<ThinkingLevel, string> = {
  off: 'text-muted', minimal: 'text-muted', low: 'text-info',
  medium: 'text-primarySoft', high: 'text-primary', xhigh: 'text-primary', max: 'text-primary'
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  return ref
}

export function ModelPicker() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const models = useAgent((s) => s.models)
  const state = useAgent((s) => s.state)
  const ref = useOutside(() => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
      >
        <Cpu size={14} strokeWidth={1.75} className="text-dim" />
        <span className="max-w-[190px] truncate">{state?.model?.name ?? '—'}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="text-dim" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-40 mb-2 max-h-[380px] w-[330px] animate-fade-up overflow-y-auto rounded-xl border border-[var(--p-line)] bg-[var(--p-panel)] p-1.5 shadow-2xl shadow-black/60">
          <div className="px-2.5 py-1.5 text-micro font-semibold uppercase tracking-wider text-dim">
            {t('model.label')}
          </div>
          {models.map((m) => {
            const active = state?.model?.id === m.id
            return (
              <button
                key={m.id}
                onClick={() => {
                  void setModel(m.provider, m.id)
                  setOpen(false)
                }}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ' +
                  (active ? 'bg-primary/[0.16]' : 'hover:bg-white/[0.05]')
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg">{m.name}</div>
                  <div className="truncate font-mono text-micro text-dim">
                    {m.provider}/{m.id}
                    {m.cost ? ` · $${m.cost.input}/$${m.cost.output} ${t('model.perMtok')}` : ''}
                  </div>
                </div>
                {m.reasoning && (
                  <span className="shrink-0" title={t('model.reasoning')}>
                    <Brain size={14} strokeWidth={1.75} className="text-dim" />
                  </span>
                )}
                {active && <Check size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ThinkingPicker() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const state = useAgent((s) => s.state)
  const ref = useOutside(() => setOpen(false))
  const level = (state?.thinkingLevel ?? 'medium') as ThinkingLevel

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
      >
        <Brain size={14} strokeWidth={1.75} className={THINKING_COLOR[level]} />
        <span>{thinkingLabel(level)}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="text-dim" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-40 mb-2 w-[190px] animate-fade-up rounded-xl border border-[var(--p-line)] bg-[var(--p-panel)] p-1.5 shadow-2xl shadow-black/60">
          <div className="px-2.5 py-1.5 text-micro font-semibold uppercase tracking-wider text-dim">
            {t('thinking.label')}
          </div>
          {THINKING_LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => {
                void setThinking(l)
                setOpen(false)
              }}
              className={
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ' +
                (l === level ? 'bg-primary/[0.16] text-fg' : 'text-muted hover:bg-white/[0.05]')
              }
            >
              <Brain size={14} strokeWidth={1.75} className={THINKING_COLOR[l]} />
              <span className="flex-1">{thinkingLabel(l)}</span>
              {l === level && <Check size={14} strokeWidth={1.75} className="text-primarySoft" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
