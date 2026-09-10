import { useT } from '../i18n'

/** Passo do ajuste por teclado. Grande o bastante para valer o toque, pequeno o bastante para acertar a largura. */
const STEP = 16

/**
 * Divisor arrastável. A área de captura é maior que a linha visível para não
 * exigir precisão de pixel; duplo clique volta à largura padrão.
 *
 * Com `onNudge` o divisor também é operável por teclado (`role="separator"`
 * focável, setas movem, Enter/Home restauram). Sem `onNudge` ele fica fora da
 * ordem de tabulação de propósito: foco que não faz nada é pior que a ausência
 * dele — quem monta o painel precisa ligar o ajuste para ganhar o foco.
 */
export function ResizeHandle({
  side,
  dragging,
  onMouseDown,
  onReset,
  onNudge,
  width,
  min,
  max
}: {
  side: 'right' | 'left'
  dragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onReset: () => void
  /** Move o divisor `delta` px no espaço do ponteiro (positivo = direita). */
  onNudge?: (delta: number) => void
  width?: number
  min?: number
  max?: number
}) {
  const { t } = useT()

  function onKeyDown(e: React.KeyboardEvent) {
    if (!onNudge) return
    // A seta move o divisor para o lado apertado; de que lado fica o painel é
    // problema do `nudge`.
    if (e.key === 'ArrowLeft') onNudge(-STEP)
    else if (e.key === 'ArrowRight') onNudge(STEP)
    else if (e.key === 'Enter' || e.key === 'Home') onReset()
    else return
    e.preventDefault()
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onReset}
      onKeyDown={onNudge ? onKeyDown : undefined}
      role={onNudge ? 'separator' : undefined}
      aria-orientation={onNudge ? 'vertical' : undefined}
      aria-label={onNudge ? t('resize.handle') : undefined}
      aria-valuenow={onNudge ? width : undefined}
      aria-valuemin={onNudge ? min : undefined}
      aria-valuemax={onNudge ? max : undefined}
      tabIndex={onNudge ? 0 : undefined}
      title={t('resize.hint')}
      className={
        'group absolute top-0 z-30 h-full w-2 cursor-col-resize outline-none ' +
        (side === 'right' ? '-right-1' : '-left-1')
      }
    >
      {/*
        O foco tem que aparecer sem mudar a aparência de repouso: o divisor
        acende a mesma linha que o hover já acende.
      */}
      <div
        className={
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ' +
          (dragging
            ? 'bg-primary'
            : 'bg-transparent group-hover:bg-primary/60 group-focus-visible:bg-primary')
        }
      />
    </div>
  )
}
