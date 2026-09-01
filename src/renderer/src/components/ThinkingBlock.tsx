import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useT } from '../i18n'

export function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-muted"
      >
        <ChevronRight
          size={16} strokeWidth={1.75}
          className={'transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <Sparkles size={14} strokeWidth={1.75} className={streaming ? 'animate-pulse-soft text-primary' : 'text-dim'} />
        <span className={streaming ? 'animate-pulse-soft' : ''}>
          {streaming ? t('thinking.streaming') : t('thinking.label')}
        </span>
      </button>

      {open && (
        <div className="mt-2 animate-fade-up border-l border-[var(--p-elevated)] pl-4 text-sm leading-relaxed text-dim whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}
