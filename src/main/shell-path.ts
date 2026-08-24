import { execFile } from 'node:child_process'
import { basename } from 'node:path'

/**
 * Obtém o `PATH` real do usuário perguntando à shell de login dele.
 *
 * Um app aberto pelo menu do sistema recebe um `PATH` mínimo da sessão gráfica.
 * O `PATH` de trabalho quase sempre nasce no arquivo de configuração da shell
 * (`.zshrc`, `.bashrc`, `config.fish`…), lido apenas por shell **interativa** —
 * por isso `-i` importa tanto quanto `-l`.
 *
 * Em vez de pedir `command -v <bin>`, que muda de sintaxe entre famílias,
 * pedimos o `PATH` e fazemos a busca aqui. Assim basta saber imprimir uma
 * variável em cada shell.
 */

const MARK = '__PRIME_DESK_PATH__'
const TIMEOUT_MS = 9000

interface Probe {
  args: string[]
  /** Separador do PATH impresso, quando a shell usa lista em vez de string. */
  joined?: boolean
}

/**
 * Como pedir o PATH em cada família de shell.
 * A ordem das tentativas vai da mais informativa (login + interativa) para a
 * mais simples, porque nem toda shell aceita `-i` junto com `-c`.
 */
function probesFor(shell: string): Probe[] {
  const name = basename(shell).replace(/\.exe$/i, '').toLowerCase()

  if (name === 'fish') {
    const cmd = `echo ${MARK}:(string join : $PATH):${MARK}`
    return [{ args: ['-l', '-i', '-c', cmd] }, { args: ['-l', '-c', cmd] }]
  }

  if (name === 'nu') {
    const cmd = `print $"${MARK}:($env.PATH | str join ':'):${MARK}"`
    return [{ args: ['-l', '-i', '-c', cmd] }, { args: ['-c', cmd] }]
  }

  if (name === 'pwsh' || name === 'powershell') {
    const cmd = `"${MARK}:" + $env:PATH + ":${MARK}"`
    return [{ args: ['-Login', '-Command', cmd] }, { args: ['-Command', cmd] }]
  }

  if (name === 'elvish') {
    const cmd = `echo ${MARK}:$E:PATH:${MARK}`
    return [{ args: ['-c', cmd] }]
  }

  if (name === 'csh' || name === 'tcsh') {
    // csh não combina bem `-i` com `-c`.
    const cmd = `echo ${MARK}:$PATH:${MARK}`
    return [{ args: ['-l', '-c', cmd] }, { args: ['-c', cmd] }]
  }

  // bash, zsh, ksh, dash, ash, sh e demais compatíveis com POSIX.
  const cmd = `echo ${MARK}:$PATH:${MARK}`
  return [
    { args: ['-l', '-i', '-c', cmd] },
    { args: ['-l', '-c', cmd] },
    { args: ['-c', cmd] }
  ]
}

function runProbe(shell: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      shell,
      args,
      {
        timeout: TIMEOUT_MS,
        // `TERM=dumb` evita que a shell interativa desenhe prompt ou cores.
        env: { ...process.env, TERM: 'dumb' },
        maxBuffer: 1024 * 1024
      },
      (_err, stdout, stderr) => {
        // Shell interativa costuma escrever MOTD e prompt; os marcadores isolam
        // o que interessa, então nem o erro nem o ruído invalidam a leitura.
        const text = `${stdout}\n${stderr}`
        const m = text.match(new RegExp(`${MARK}:([\\s\\S]*?):${MARK}`))
        const value = m?.[1]?.trim()
        resolve(value && value.includes('/') ? value : null)
      }
    )
  })
}

/** PATH da shell do usuário, ou `null` se nenhuma tentativa der certo. */
export async function getShellPath(shell?: string): Promise<string | null> {
  const target = shell || process.env.SHELL
  if (!target || process.platform === 'win32') return null

  for (const probe of probesFor(target)) {
    const value = await runProbe(target, probe.args)
    if (value) return value
  }
  return null
}

/** Diretórios do PATH da shell, sem duplicatas e sem entradas vazias. */
export async function getShellPathDirs(shell?: string): Promise<string[]> {
  const value = await getShellPath(shell)
  if (!value) return []
  const seen = new Set<string>()
  return value
    .split(':')
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !seen.has(d) && seen.add(d))
}
