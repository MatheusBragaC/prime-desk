import { useEffect, useRef, type RefObject } from 'react'

/**
 * Fecha uma sobreposição ancorada ao clicar fora ou apertar Escape.
 *
 * O bloco de `document.addEventListener('mousedown')` estava copiado em cinco
 * componentes, com divergências: só um deles guardava `if (!open) return`, e o
 * Escape funcionava em uns e não em outros — fechar o menu de modelo com o
 * teclado simplesmente não dava.
 *
 * **Escape vai em capture com `stopPropagation`**, e isso não é preciosismo:
 * o App escuta Escape no `window` para abortar o turno em andamento
 * (`App.tsx`). Em bubble, fechar um dropdown durante uma resposta abortaria a
 * resposta junto. Capture no documento roda antes do bubble na janela, então a
 * tecla morre aqui quando há popover aberto. É a mesma técnica do `Modal`.
 *
 * @param onClose  Pode ser função nova a cada render: fica numa ref, o efeito
 *                 não re-assina por causa disso.
 * @param open     Falso desliga os listeners. Componentes que só são montados
 *                 quando abertos podem omitir.
 * @param trigger  Botão que abre o popover, quando ele fica FORA do elemento
 *                 referenciado. Sem isso, clicar nele para fechar não funciona:
 *                 o `mousedown` conta como clique fora e fecha, e o `click`
 *                 seguinte alterna de volta para aberto. Quem envolve botão e
 *                 conteúdo no mesmo elemento não precisa passar.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  open = true,
  trigger?: RefObject<HTMLElement | null>
): RefObject<T> {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return

    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (trigger?.current?.contains(target)) return
      if (ref.current && !ref.current.contains(target)) close.current()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, trigger])

  return ref
}
