import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useT } from '../i18n'

export function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1.5 text-[12.5px] text-dim transition-colors hover:text-muted"
      >
        <ChevronRight
          size={13}
          className={'transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <Sparkles size={12} className={streaming ? 'animate-pulse-soft text-primary' : 'text-dim'} />
        <span className={streaming ? 'animate-pulse-soft' : ''}>
          {streaming ? t('thinking.streaming') : t('thinking.label')}
        </span>
      </button>

      {open && (
        <div className="mt-2 animate-fade-up border-l border-white/10 pl-3.5 text-[13px] italic leading-relaxed text-[#8b8b94] whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}
