import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '@/i18n'
import { useDialogA11y } from '@/lib/useDialogA11y'

/**
 * Modal padrão do Prime Desk.
 *
 * Um único componente para todo diálogo do app: mesma moldura, mesmo
 * espaçamento, mesmo comportamento de teclado. Fecha com Esc e com clique fora,
 * devolve o foco ao elemento anterior e prende o Tab dentro do diálogo — isso
 * tudo vem do `useDialogA11y`, compartilhado com a paleta de comandos.
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
  const { t } = useT()
  const dialog = useDialogA11y(open, title, onClose)

  // Instante da abertura: um clique isolado logo após abrir (inclusive o próprio
  // que abriu o diálogo, ou um clique perdido na janela) não deve fechá-lo.
  const openedAt = useRef(0)
  useEffect(() => {
    if (open) openedAt.current = Date.now()
  }, [open])

  // `onClose` inline muda de identidade a cada render do pai; o clique no véu lê
  // a versão corrente pela ref em vez de reassinar nada.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  if (!open) return null

  /*
    Portal para `document.body`, fora de `#root`.
    ---
    O painel de uso abre a partir da tela inicial, que mora dentro de duas
    divs com `position: relative` + `z-index` não-auto (o "palco" e o rolador
    da conversa, em App.tsx). Cada uma dessas cria seu próprio contexto de
    empilhamento — e "fixed" só escapa da geometria do ancestral, não do
    contexto de empilhamento dele. Resultado: mesmo com z-modal, o modal ficava
    preso dentro do contexto do rolador, que empata em z-index com o composer
    (irmão seguinte, mesmo z-10) — e por ordem no DOM o composer pintava por
    cima. É por isso que só ESTE modal (o único aberto de dentro da árvore da
    conversa) sofria; ConfirmDialog, CommandPalette e SshModal já nascem como
    filhos diretos da raiz do app e nunca entram nessa armadilha.

    Portal resolve na raiz: o modal deixa de ser descendente de qualquer
    contexto de empilhamento do app, então nenhuma pilha de z-index interna
    consegue mais pintar por cima dele.
  */
  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim p-6 backdrop-blur-[2px]"
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
        ref={dialog.ref}
        {...dialog.dialogProps}
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-full animate-fade-up overflow-y-auto rounded-2xl border border-lineStrong bg-[var(--p-panel)] shadow-2xl shadow-drop"
      >
        <div className="flex items-start gap-3 px-5 pb-1 pt-5">
          <h2 className="flex-1 text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-dim transition-colors hover:bg-hover hover:text-fg"
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
    </div>,
    document.body
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
  'w-full rounded-lg border border-[var(--p-line)] bg-well px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-dim focus:border-primary/50'

/*
  O botão mudou de casa para `ui/Button.tsx`, junto do `InlineEdit`: ele não é
  peça de diálogo, e morar aqui obrigava quem queria um botão a importar o
  módulo de modal. Reexportado para os três importadores atuais não mudarem.
*/
export { Button } from './ui/Button'
