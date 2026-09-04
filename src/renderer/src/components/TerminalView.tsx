import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

/**
 * Um shell, ligado a um PTY do processo principal.
 *
 * O PTY sobrevive à desmontagem do componente: trocar de painel e voltar não
 * mata o que estava rodando. Por isso a montagem pede o `scrollback` acumulado
 * antes de assinar o fluxo — sem isso a tela voltaria em branco com o processo
 * ainda vivo, que é pior do que não ter histórico nenhum.
 */
export function TerminalView({ id, cwd, command, onExit }: {
  id: string
  cwd: string
  /** Digitado no shell na criação. Só vale na primeira montagem do PTY. */
  command?: string
  onExit?: (code: number) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    const el = host.current
    if (!el) return

    const term = new Terminal({
      fontFamily: 'var(--p-mono), monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      // O tema segue os tokens do app: um terminal com fundo próprio brigaria
      // com o painel em volta.
      theme: {
        background: '#08080a',
        foreground: '#c9c9d1',
        cursor: '#7a7aff',
        selectionBackground: 'rgba(122,122,255,.28)'
      },
      allowProposedApi: true
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)

    let disposed = false

    /** Reporta as dimensões ao PTY: sem isso o shell quebra linha no lugar errado. */
    const sync = () => {
      if (disposed) return
      try {
        fit.fit()
      } catch {
        // Painel ainda sem layout; o ResizeObserver chama de novo.
        return
      }
      void window.prime.resizeTerminal(id, term.cols, term.rows)
    }

    const offData = window.prime.on('terminal:data', (payload) => {
      const p = payload as { id: string; data: string }
      if (p.id === id) term.write(p.data)
    })

    const offExit = window.prime.on('terminal:exit', (payload) => {
      const p = payload as { id: string; exitCode: number }
      if (p.id !== id) return
      term.write('\r\n\x1b[2m[processo encerrado]\x1b[0m\r\n')
      onExitRef.current?.(p.exitCode)
    })

    const typed = term.onData((data) => void window.prime.writeTerminal(id, data))

    const observer = new ResizeObserver(sync)
    observer.observe(el)

    void (async () => {
      const created = await window.prime.createTerminal({ id, cwd, command })
      if (disposed) return
      if (!created?.ok) {
        term.write(`\x1b[31m${created?.error ?? 'Falha ao abrir o terminal.'}\x1b[0m\r\n`)
        return
      }
      const back = await window.prime.terminalScrollback(id)
      if (disposed) return
      if (back?.scrollback) term.write(back.scrollback)
      sync()
      term.focus()
    })()

    return () => {
      disposed = true
      observer.disconnect()
      typed.dispose()
      offData()
      offExit()
      term.dispose()
    }
  }, [id, cwd, command])

  return <div ref={host} className="h-full w-full overflow-hidden px-2 py-1.5" />
}
