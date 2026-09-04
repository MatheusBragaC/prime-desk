import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'

/**
 * Casca dos painéis do dock à direita.
 *
 * O `<aside>` e o bloco do `ResizeHandle` eram byte-a-byte idênticos em quatro
 * componentes; com painéis novos a caminho, viraria sete. O Sidebar fica de
 * fora de propósito: é variante (cresce para a direita, sem borda esquerda, e o
 * cabeçalho recua por causa dos semáforos do macOS).
 *
 * A `storageKey` alimenta `prime-desk:width:${key}` no localStorage — trocar a
 * chave de um painel existente apagaria a largura que a pessoa ajustou.
 */
export function DockPanel({
  storageKey,
  defaultWidth,
  min,
  max,
  icon,
  title,
  onClose,
  actions,
  header,
  footer,
  headerBorder = true,
  bodyClassName = 'min-h-0 flex-1 overflow-y-auto',
  children
}: {
  storageKey: string
  defaultWidth: number
  min: number
  max: number
  icon?: ReactNode
  title?: string
  onClose: () => void
  /** Botões à direita do título, antes do fechar. */
  actions?: ReactNode
  /** Substitui a linha de título inteira. O painel de terminal usa abas aqui. */
  header?: ReactNode
  footer?: ReactNode
  /** O painel de alterações não tem régua sob o cabeçalho; os outros têm. */
  headerBorder?: boolean
  bodyClassName?: string
  children: ReactNode
}) {
  const size = useResizable(storageKey, defaultWidth, min, max, 'left')

  return (
    <aside
      style={{ width: size.width }}
      className="relative flex shrink-0 flex-col border-l border-[var(--p-line)] bg-[var(--p-surface)]"
    >
      <ResizeHandle
        side="left"
        dragging={size.dragging}
        onMouseDown={size.onMouseDown}
        onReset={size.reset}
      />

      {/*
        `drag-region` faz a faixa arrastar a janela (que é frameless); cada
        controle dentro dela precisa de `no-drag`, senão vira área de arraste e
        para de responder ao clique.
      */}
      {header ?? (
        <div
          className={
            'drag-region flex h-[var(--p-titlebar)] items-center gap-2 px-4 ' +
            (headerBorder ? 'border-b border-[var(--p-line)]' : '')
          }
        >
          {icon}
          <span className="flex-1 truncate text-sm font-semibold">{title}</span>
          {actions}
          <button
            onClick={onClose}
            className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div className={bodyClassName}>{children}</div>

      {footer}
    </aside>
  )
}
