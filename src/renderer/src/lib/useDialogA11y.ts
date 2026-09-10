import { useEffect, useRef } from 'react'

/**
 * Semântica e teclado de diálogo, sem opinar sobre a moldura.
 *
 * O `Modal` era o único lugar do renderer com ARIA de diálogo; a paleta de
 * comandos repetia a casca à mão e ficava sem `role`, sem `aria-modal`, sem
 * armadilha de Tab e com Escape que só funcionava se o foco estivesse dentro da
 * caixa. O comportamento mora aqui para que uma casca própria (a paleta abre
 * colada no topo, sem cabeçalho, com busca em foco) não custe a acessibilidade.
 */

/** Elementos que o Tab alcança dentro do diálogo. */
const FOCUSABLE =
  'input, textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Para onde o Tab vai quando o foco está numa ponta da lista — é o que fecha o
 * ciclo dentro do diálogo. Fora das pontas devolve `null`: aí a ordem natural do
 * navegador já faz a coisa certa e interceptar só atrapalharia.
 */
export function trapTarget<T>(list: T[], active: T | null, shiftKey: boolean): T | null {
  if (list.length === 0) return null
  const first = list[0]
  const last = list[list.length - 1]
  if (shiftKey) return active === first ? last : null
  return active === last ? first : null
}

export function useDialogA11y(
  open: boolean,
  label: string,
  onClose: () => void
): {
  ref: React.RefObject<HTMLDivElement>
  dialogProps: { role: 'dialog'; 'aria-modal': true; 'aria-label': string }
} {
  const panel = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  // `onClose` costuma chegar como arrow inline, ou seja, muda de identidade a
  // cada render do pai. Guardar em ref mantém o efeito preso apenas a `open`:
  // sem isso, cada re-render do app refazia listeners e devolvia o foco, o que
  // deixava o diálogo instável enquanto o poller de agentes rodava.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return

    restoreFocus.current = document.activeElement as HTMLElement | null

    const focusable = (): HTMLElement[] =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null
      )

    // Primeiro campo em foco: o diálogo existe para ser preenchido.
    setTimeout(() => {
      const list = focusable()
      const firstField = list.find((el) => el instanceof HTMLInputElement) ?? list[0]
      firstField?.focus()
    }, 20)

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const next = trapTarget(focusable(), document.activeElement as HTMLElement | null, e.shiftKey)
      if (!next) return
      e.preventDefault()
      next.focus()
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      restoreFocus.current?.focus?.()
    }
  }, [open])

  return {
    ref: panel,
    dialogProps: { role: 'dialog', 'aria-modal': true, 'aria-label': label }
  }
}
