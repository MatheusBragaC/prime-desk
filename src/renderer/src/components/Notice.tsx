import { useEffect } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { useAgent } from '../store/agent'

/** Aviso transitório. Erros de comando não devem morrer só no console. */
export function Notice() {
  const notice = useAgent((s) => s.notice)
  const clear = useAgent((s) => s.clearNotice)

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clear, notice.kind === 'error' ? 9000 : 5000)
    return () => clearTimeout(t)
  }, [notice, clear])

  if (!notice) return null

  const err = notice.kind === 'error'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--p-titlebar)+12px)] z-50 flex justify-center px-6">
      <div
        className={
          'pointer-events-auto flex max-w-[620px] animate-fade-up items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-2xl shadow-black/60 ' +
          (err
            ? 'border-err/30 bg-[#20121a] text-err'
            : 'border-white/[0.1] bg-[var(--p-panel)] text-muted')
        }
      >
        {err ? (
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-[2px] shrink-0" />
        ) : (
          <Info size={16} strokeWidth={1.75} className="mt-[2px] shrink-0" />
        )}
        <span className="text-sm leading-snug">{notice.text}</span>
        <button onClick={clear} className="mt-[2px] shrink-0 opacity-60 transition-opacity hover:opacity-100">
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
