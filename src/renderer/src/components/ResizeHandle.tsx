/**
 * Divisor arrastável. A área de captura é maior que a linha visível para não
 * exigir precisão de pixel; duplo clique volta à largura padrão.
 */
export function ResizeHandle({
  side,
  dragging,
  onMouseDown,
  onReset
}: {
  side: 'right' | 'left'
  dragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onReset: () => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onReset}
      title="Arraste para redimensionar · duplo clique para restaurar"
      className={
        'group absolute top-0 z-30 h-full w-2 cursor-col-resize ' +
        (side === 'right' ? '-right-1' : '-left-1')
      }
    >
      <div
        className={
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 ' +
          (dragging ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/60')
        }
      />
    </div>
  )
}
