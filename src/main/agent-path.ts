import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { getShellPathDirs } from './shell-path.js'

/**
 * Descobre onde está o `prime-agent`.
 *
 * Um app aberto pelo menu do sistema **não herda o PATH do shell**. No Linux a
 * sessão gráfica exporta um PATH mínimo, e instalações via npm global costumam
 * ficar em `~/.npm-global/bin`, adicionado no `.bashrc` — que só é lido por
 * shell interativo. Resultado: `which prime-agent` falha no app instalado e
 * funciona quando ele é aberto de um terminal.
 *
 * A busca vai do mais barato ao mais caro e para no primeiro acerto.
 */

const BIN = 'prime-agent'
const EXEC_TIMEOUT = 8000

let cached: string | null = null
let resolved = false
let shellDirs: string[] = []

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: EXEC_TIMEOUT }, (err, stdout) => {
      resolve(err ? null : stdout.trim().split('\n')[0] || null)
    })
  })
}

function candidateDirs(): string[] {
  const home = homedir()
  const dirs = [
    join(home, '.npm-global', 'bin'),
    join(home, '.local', 'bin'),
    join(home, '.local', 'share', 'npm', 'bin'),
    join(home, 'bin'),
    join(home, '.bun', 'bin'),
    '/usr/local/bin',
    '/usr/bin'
  ]
  if (platform() === 'darwin') dirs.push('/opt/homebrew/bin')
  return dirs
}

export async function resolveAgentPath(force = false): Promise<string | null> {
  if (resolved && !force) return cached
  resolved = true

  // 1. PATH atual — acerta quando o app foi aberto de um terminal.
  const direct = await run('which', [BIN])
  if (direct && existsSync(direct)) return (cached = direct)

  /*
    2. PATH da shell do usuário (zsh, bash, fish, nu, pwsh…). É onde o binário
       quase sempre está, já que o `PATH` de trabalho nasce no rc da shell.
       Guardamos os diretórios para repassar ao agente depois.
  */
  shellDirs = await getShellPathDirs()
  for (const dir of shellDirs) {
    const guess = join(dir, BIN)
    if (existsSync(guess)) return (cached = guess)
  }

  // 2b. Se o usuário usa uma shell exótica, o bash ainda costuma existir.
  if (shellDirs.length === 0 && process.env.SHELL !== '/bin/bash') {
    shellDirs = await getShellPathDirs('/bin/bash')
    for (const dir of shellDirs) {
      const guess = join(dir, BIN)
      if (existsSync(guess)) return (cached = guess)
    }
  }

  // 3. Prefixo global do npm, que é onde o instalador oficial costuma gravar.
  const prefix = await run('npm', ['prefix', '-g'])
  if (prefix) {
    const guess = join(prefix, 'bin', BIN)
    if (existsSync(guess)) return (cached = guess)
  }

  // 4. Locais conhecidos.
  for (const dir of candidateDirs()) {
    const guess = join(dir, BIN)
    if (existsSync(guess)) return (cached = guess)
  }

  return (cached = null)
}

/** Caminho resolvido, ou o nome puro para deixar o erro de spawn falar. */
export function agentBinary(): string {
  return cached ?? BIN
}

/**
 * Ambiente para processos filhos, com o diretório do agente à frente do PATH.
 * Sem isso, o próprio agente não encontraria ferramentas vizinhas instaladas
 * no mesmo prefixo.
 */
export function agentEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...(extra ?? {}) }

  /*
    O agente executa ferramentas do usuário (git, python, docker…). Rodando a
    partir do menu, ele herdaria o PATH mínimo da sessão gráfica e não acharia
    nenhuma delas. Repassamos o PATH real da shell, com o diretório do próprio
    binário à frente.
  */
  const current = (env.PATH ?? '').split(':').filter(Boolean)
  const extras = cached ? [dirname(cached), ...shellDirs] : shellDirs
  const merged: string[] = []
  const seen = new Set<string>()
  for (const dir of [...extras, ...current]) {
    if (dir && !seen.has(dir)) {
      seen.add(dir)
      merged.push(dir)
    }
  }
  if (merged.length > 0) env.PATH = merged.join(':')

  return env
}

/** Reavalia depois de uma instalação. */
export function invalidateAgentPath(): void {
  resolved = false
  cached = null
  shellDirs = []
}
