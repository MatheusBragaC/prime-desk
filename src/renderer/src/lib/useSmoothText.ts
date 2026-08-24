import { useEffect, useRef, useState } from 'react'

/**
 * Revela o texto de forma contínua durante o streaming.
 *
 * Medição feita durante um turno real: 60fps estáveis (p50/p90/p99 = 17ms, zero
 * quadros acima de 50ms, nenhuma longtask). Ou seja, não havia travamento de
 * renderização — o que "trava" é o texto chegando do modelo em rajadas e sendo
 * pintado de uma vez. Aqui a exibição avança em ritmo próprio a cada quadro,
 * proporcional ao quanto falta, então o texto escorre em vez de saltar.
 */
export function useSmoothText(target: string, active: boolean): string {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  const targetRef = useRef(target)

  targetRef.current = target

  useEffect(() => {
    if (!active) {
      // Terminou (ou nem começou): mostra tudo imediatamente.
      shownRef.current = targetRef.current
      setShown(targetRef.current)
      return
    }

    let raf = 0
    const tick = () => {
      const full = targetRef.current
      const cur = shownRef.current

      if (!full.startsWith(cur)) {
        // O texto mudou de forma não incremental (edição/recarga): sincroniza.
        shownRef.current = full
        setShown(full)
      } else if (cur.length < full.length) {
        const backlog = full.length - cur.length
        // Quanto maior o atraso, mais rápido revela: evita ficar para trás em
        // rajadas grandes sem perder a sensação de digitação.
        const step = Math.max(2, Math.ceil(backlog / 5))
        shownRef.current = full.slice(0, cur.length + step)
        setShown(shownRef.current)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  // Se o alvo encolher (nova mensagem reusando a posição), acompanha na hora.
  useEffect(() => {
    if (target.length < shownRef.current.length) {
      shownRef.current = target
      setShown(target)
    }
  }, [target])

  return active ? shown : target
}
