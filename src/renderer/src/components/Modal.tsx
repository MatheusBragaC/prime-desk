import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useT } from '../i18n'

/**
 * Modal padrão do Prime Desk.
 *
 * Um único componente para todo diálogo do app: mesma moldura, mesmo
 * espaçamento, mesmo comportamento de teclado. Fecha com Esc e com clique fora,
 * devolve o foco ao elemento anterior e prende o Tab dentro do diálogo.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 460
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const panel = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  // `onClose` costuma chegar como arrow inline, ou seja, muda de identidade a
  // cada render do pai. Guardar em ref mantém o efeito preso apenas a `open`:
  // sem isso, cada re-render do app refazia listeners e devolvia o foco, o que
  // deixava o diálogo instável enquanto o poller de agentes rodava.
  const { t } = useT()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Instante da abertura: um clique isolado logo após abrir (inclusive o próprio
  // que abriu o diálogo, ou um clique perdido na janela) não deve fechá-lo.
  const openedAt = useRef(0)

  useEffect(() => {
    if (!open) return

    restoreFocus.current = document.activeElement as HTMLElement | null
    openedAt.current = Date.now()

    const focusable = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'input, textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null)

    // Primeiro campo em foco: o diálogo existe para ser preenchido.
    setTimeout(() => {
      const list = focusable()
      const firstField = list.find((el) => el instanceof HTMLInputElement) ?? list[0]
      firstField?.focus()
    }, 20)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const list = focusable()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      restoreFocus.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]"
      onClick={(e) => {
        // Fecha no clique completo (press + release) na área externa. Usar
        // mousedown fechava o diálogo com press perdido ou com arraste que
        // começa dentro e termina fora.
        if (e.target !== e.currentTarget) return
        if (Date.now() - openedAt.current < 300) return
        closeRef.current()
      }}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-full animate-fade-up overflow-y-auto rounded-2xl border border-white/[0.1] bg-[var(--p-panel)] shadow-2xl shadow-black/70"
      >
        <div className="flex items-start gap-3 px-5 pb-1 pt-5">
          <h2 className="flex-1 text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-dim transition-colors hover:bg-white/[0.07] hover:text-fg"
            aria-label={t('common.close')}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {description && (
          <p className="px-5 pb-1 pt-1 text-sm leading-relaxed text-muted">{description}</p>
        )}

        <div className="px-5 py-3">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--p-line)] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Campo de formulário do padrão: rótulo, controle e dica auxiliar. */
export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-snug text-dim">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[var(--p-line)] bg-black/30 px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-dim focus:border-primary/50'

export function Button({
  variant = 'ghost',
  children,
  ...rest
}: {
  variant?: 'primary' | 'ghost' | 'subtle'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const style =
    variant === 'primary'
      ? 'border border-primary/40 bg-primary/20 text-fg hover:bg-primary/30'
      : variant === 'subtle'
        ? 'border border-white/[0.1] text-muted hover:border-white/20 hover:text-fg'
        : 'text-muted hover:bg-white/[0.06] hover:text-fg'
  return (
    <button className={`${base} ${style}`} {...rest}>
      {children}
    </button>
  )
}
