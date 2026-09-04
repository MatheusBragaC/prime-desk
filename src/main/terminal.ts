import { platform } from 'node:os'
import { existsSync } from 'node:fs'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { agentEnv } from './agent-path.js'

/**
 * Terminais embutidos.
 *
 * O botão de terminal abria uma janela do `gnome-terminal`/`konsole` por fora
 * do app. Isso quebrava a continuidade — o usuário saía do Prime Desk para ver
 * o que o agente estava fazendo — e dependia de qual emulador a distro tinha
 * instalado, com o histórico de falha silenciosa do gnome-terminal registrado
 * em docs/MAPEAMENTO.md §24.
 *
 * Aqui o shell roda num PTY de verdade dentro do processo principal e a saída
 * vai para um xterm.js no renderer. PTY, e não pipes, porque sem TTY os
 * programas desligam cor, o prompt não ecoa e `vim`/`htop` não funcionam.
 */

export interface TerminalSpec {
  id: string
  cwd: string
  /** Comando inicial digitado no shell assim que ele sobe. Opcional. */
  command?: string
}

interface Session {
  id: string
  proc: pty.IPty
  /** Última saída, para repovoar a tela quando o painel remonta. */
  scrollback: string
  cwd: string
  exited: boolean
}

/** Teto do replay guardado por terminal. Passou disso, corta o começo. */
const SCROLLBACK_LIMIT = 200_000

const sessions = new Map<string, Session>()

/** Shell de login do usuário, com queda para algo que exista. */
function defaultShell(): string {
  if (platform() === 'win32') return process.env.COMSPEC || 'powershell.exe'
  const fromEnv = process.env.SHELL
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

/**
 * O PTY herda o PATH resolvido para o agente, não o do processo gráfico.
 *
 * App aberto pelo menu do sistema não herda o PATH do shell (MAPEAMENTO §30):
 * sem isso, `prime-agent` não seria encontrado dentro do próprio terminal do
 * app — que é justamente onde o usuário esperaria rodá-lo.
 */
function terminalEnv(): Record<string, string> {
  const env = agentEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })
  delete env.NO_COLOR
  // `node-pty` não aceita chave com valor indefinido, que é o que ProcessEnv
  // admite; as ausentes simplesmente não vão.
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v
  return clean
}

export function createTerminal(
  spec: TerminalSpec,
  target: WebContents
): { ok: boolean; error?: string } {
  if (sessions.has(spec.id)) return { ok: true }

  let proc: pty.IPty
  try {
    proc = pty.spawn(defaultShell(), [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: spec.cwd,
      env: terminalEnv()
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  const session: Session = { id: spec.id, proc, scrollback: '', cwd: spec.cwd, exited: false }
  sessions.set(spec.id, session)

  proc.onData((data) => {
    session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_LIMIT)
    if (!target.isDestroyed()) target.send('terminal:data', { id: spec.id, data })
  })

  proc.onExit(({ exitCode, signal }) => {
    session.exited = true
    sessions.delete(spec.id)
    if (!target.isDestroyed()) target.send('terminal:exit', { id: spec.id, exitCode, signal })
  })

  if (spec.command) proc.write(`${spec.command}\r`)

  return { ok: true }
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.proc.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = sessions.get(id)
  if (!session || session.exited) return
  // O PTY rejeita dimensão zero, que acontece enquanto o painel ainda não tem
  // layout — deixar passar mata o processo com EINVAL.
  if (cols < 1 || rows < 1) return
  try {
    session.proc.resize(cols, rows)
  } catch {
    // A corrida entre resize e exit é esperada; o onExit já cuidou da limpeza.
  }
}

/** Saída acumulada, para o painel remontar sem perder o que já rolou. */
export function terminalScrollback(id: string): string {
  return sessions.get(id)?.scrollback ?? ''
}

export function killTerminal(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  sessions.delete(id)
  try {
    session.proc.kill()
  } catch {
    // Já morreu por conta própria.
  }
}

export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) killTerminal(id)
}

export function listTerminals(): { id: string; cwd: string }[] {
  return [...sessions.values()].map((s) => ({ id: s.id, cwd: s.cwd }))
}
