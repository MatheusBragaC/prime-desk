import { useCallback, useEffect, useRef } from 'react'

/**
 * Rolagem da conversa: abre no fim e adere ao fim enquanto a resposta cresce.
 *
 * Dois comportamentos que parecem um só, e não são:
 *
 * 1. **Abrir no fim.** Uma vez por conversa. Sem a guarda por sessão, cada
 *    mensagem nova durante o streaming roubaria o scroll de quem subiu para
 *    reler algo.
 * 2. **Aderir ao fim.** A cada mensagem, mas só se a pessoa já estava no fim.
 *    `pinned` guarda isso, com folga de 90px — quem subiu fica onde está.
 *
 * A parte difícil é que a altura final não existe na primeira pintura: imagens
 * anexadas carregam, o realce de sintaxe re-renderiza os blocos de código e as
 * fontes embutidas reflowam o texto. Seis quadros de `requestAnimationFrame`
 * (~100ms) terminavam antes disso e a conversa abria no meio. Por isso um
 * `ResizeObserver` cola no fim enquanto o conteúdo crescer, por até 2s.
 */

/** Distância do fim, em px, que ainda conta como "está no fim". */
const STICK_SLACK = 90
const SETTLE_MS = 2000

export interface StickyScroll {
  ref: React.RefObject<HTMLDivElement>
  onScroll: () => void
}

export interface StickyScrollOptions {
  sessionId: string | undefined
  loadingSession: boolean
  messageCount: number
  /**
   * Gatilhos da adesão contínua — mudam a cada bloco novo que chega. Vão como
   * lista de dependências do efeito, então o tamanho tem de ser constante.
   */
  sticksOn: readonly unknown[]
}

export function useStickyScroll({
  sessionId,
  loadingSession,
  messageCount,
  sticksOn
}: StickyScrollOptions): StickyScroll {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  /** Conversa cuja abertura já foi posicionada no fim. */
  const scrolledFor = useRef<string | null>(null)

  useEffect(() => {
    if (loadingSession || messageCount === 0) return

    const key = sessionId ?? ''
    if (scrolledFor.current === key) return
    scrolledFor.current = key

    pinned.current = true

    const el = ref.current
    if (!el) return

    const stick = (): void => {
      el.scrollTop = el.scrollHeight
    }
    stick()

    const content = el.firstElementChild
    const ro = new ResizeObserver(stick)
    if (content) ro.observe(content)

    const imgs = Array.from(el.querySelectorAll('img'))
    for (const img of imgs) img.addEventListener('load', stick)

    const release = (): void => {
      ro.disconnect()
      for (const img of imgs) img.removeEventListener('load', stick)
    }
    const timer = setTimeout(release, SETTLE_MS)

    return () => {
      clearTimeout(timer)
      release()
    }
  }, [sessionId, loadingSession, messageCount])

  // Adesão contínua, separada da abertura.
  useEffect(() => {
    const el = ref.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
    // Identidade dos gatilhos é o sinal; o hook não olha dentro deles.
  }, sticksOn)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_SLACK
  }, [])

  return { ref, onScroll }
}
