import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Carga assíncrona com estado.
 *
 * O padrão estava reimplementado em seis lugares com três representações
 * diferentes do mesmo estado — `loading` booleano em FilesPanel e DiffPanel,
 * máquina de três estados no FileViewer, sem `error` no nó da árvore de
 * arquivos. Este hook é o formato único.
 *
 * Três coisas que ele resolve e que nenhuma das versões manuais fazia:
 *
 * 1. **`loading` e `refreshing` separados.** O DiffPanel gira o ícone durante a
 *    recarga enquanto mantém a lista antiga na tela; o FilesPanel precisa
 *    nascer carregando. Um booleano só serve a um dos dois.
 * 2. **Resposta obsoleta é descartada.** Trocar de diretório rápido no
 *    FilesPanel deixava a resposta antiga sobrescrever a nova; o ContextChips
 *    contornava na mão com `let alive`. Aqui cada carga tem uma época, e só a
 *    mais recente pode escrever.
 * 3. **Nada de `setState` depois de desmontar.**
 */

export interface Async<T> {
  data: T | null
  error: string | null
  /** Primeira carga, sem dado na tela. */
  loading: boolean
  /** Recarga com dado antigo ainda visível. */
  refreshing: boolean
  reload: () => Promise<void>
  /** Escrita direta, para quem alimenta o dado fora do ciclo. */
  setData: (value: T | null) => void
}

export interface AsyncOptions {
  /** Falso adia a primeira carga até alguém chamar `reload`. Padrão: true. */
  immediate?: boolean
  /** Recarrega neste intervalo enquanto montado. Zero ou ausente desliga. */
  pollMs?: number
  /** Mantém o dado anterior enquanto as deps mudam. Padrão: false. */
  keepPrevious?: boolean
}

export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  opts: AsyncOptions = {}
): Async<T> {
  const { immediate = true, pollMs = 0, keepPrevious = false } = opts

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(immediate)
  const [refreshing, setRefreshing] = useState(false)

  // A função de carga costuma ser recriada a cada render; guardá-la numa ref
  // evita que o efeito re-assine por isso. Quem decide quando recarregar são as
  // `deps` declaradas pelo chamador.
  const loadRef = useRef(load)
  loadRef.current = load

  const epoch = useRef(0)
  const mounted = useRef(true)
  const hasData = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const mine = ++epoch.current
    const controller = new AbortController()

    if (hasData.current) setRefreshing(true)
    else setLoading(true)

    try {
      const value = await loadRef.current(controller.signal)
      // Chegou tarde: outra carga começou depois desta.
      if (!mounted.current || mine !== epoch.current) return
      setData(value)
      hasData.current = true
      setError(null)
    } catch (e) {
      if (!mounted.current || mine !== epoch.current) return
      setError(e instanceof Error ? e.message : String(e))
      if (!keepPrevious) {
        setData(null)
        hasData.current = false
      }
    } finally {
      if (mounted.current && mine === epoch.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [keepPrevious])

  useEffect(() => {
    if (!keepPrevious) hasData.current = false
    if (immediate) void run()
    // As deps são do chamador; `run` é estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!pollMs) return
    const timer = setInterval(() => void run(), pollMs)
    return () => clearInterval(timer)
  }, [pollMs, run])

  const write = useCallback((value: T | null) => {
    // Invalida cargas em voo: escrita manual é a verdade mais recente.
    epoch.current++
    hasData.current = value !== null
    setData(value)
    setError(null)
    setLoading(false)
    setRefreshing(false)
  }, [])

  return { data, error, loading, refreshing, reload: run, setData: write }
}
