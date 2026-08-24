import { realpath, mkdir, writeFile, chmod, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * Execução remota via SSH.
 *
 * O prime-agent não tem modo remoto embutido: quem fornece isso é a extensão de
 * exemplo `examples/extensions/ssh.ts`, que troca as operações das ferramentas
 * `bash` e `edit` por execução sobre SSH.
 *
 *   prime-agent -e <ssh.ts> --ssh user@host[:/caminho]
 *
 * Requer autenticação por chave — o prompt de senha travaria o agente.
 */

function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [bin], { timeout: 4000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

/** Acha o `ssh.ts` a partir do binário do prime-agent resolvido no PATH. */
export async function resolveSshExtension(): Promise<string | null> {
  const bin = await which('prime-agent')
  if (!bin) return null

  let real: string
  try {
    real = await realpath(bin)
  } catch {
    return null
  }

  // .../node_modules/prime-agent/dist/bundle/cli.js -> .../prime-agent
  let dir = dirname(real)
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'examples', 'extensions', 'ssh.ts')
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  return null
}

/** `user@host` ou `user@host:/caminho`. Sem espaços nem metacaracteres. */
export function isValidSshTarget(target: string): boolean {
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+(:\/[^\s'"`$;|&]*)?$/.test(target.trim())
}


// ---------------------------------------------------------------- conexões

export interface SshConnection {
  id: string
  name: string
  host: string
  port?: number
  identity?: string
  remotePath?: string
}

function connectionsFile(): string {
  return join(app.getPath('userData'), 'ssh-connections.json')
}

export async function loadConnections(): Promise<SshConnection[]> {
  try {
    const raw = await readFile(connectionsFile(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SshConnection[]) : []
  } catch {
    return []
  }
}

export async function saveConnections(list: SshConnection[]): Promise<SshConnection[]> {
  const clean = list
    .filter((c) => c && typeof c.host === 'string' && isValidSshTarget(c.host))
    .map((c) => ({
      id: String(c.id).slice(0, 40),
      name: String(c.name ?? '').slice(0, 60),
      host: c.host.trim(),
      port: c.port && c.port > 0 && c.port < 65536 ? Math.floor(c.port) : undefined,
      identity: c.identity?.trim() || undefined,
      remotePath: c.remotePath?.trim() || undefined
    }))
  const path = connectionsFile()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(clean, null, 2), 'utf-8')
  return clean
}

// ---------------------------------------------------------------- teste

function expandHome(p: string): string {
  return p.startsWith('~') ? join(app.getPath('home'), p.slice(1)) : p
}

/** Testa a conexão sem nunca abrir prompt interativo. */
export function testConnection(conn: {
  host: string
  port?: number
  identity?: string
}): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    if (!isValidSshTarget(conn.host)) {
      return resolve({ ok: false, message: 'Host inválido. Use usuário@host.' })
    }

    const args = [
      '-o', 'BatchMode=yes',            // nunca pede senha: falha em vez de travar
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=8'
    ]
    if (conn.port) args.push('-p', String(conn.port))
    if (conn.identity) args.push('-i', expandHome(conn.identity))
    args.push(conn.host, 'echo prime-desk-ok && pwd')

    execFile('ssh', args, { timeout: 15_000 }, (err, stdout, stderr) => {
      if (!err && stdout.includes('prime-desk-ok')) {
        const pwd = stdout.split('\n').filter(Boolean).pop() ?? ''
        return resolve({ ok: true, message: `Conectado. Diretório remoto: ${pwd}` })
      }
      const raw = (stderr || String(err?.message ?? '')).trim()
      let message = raw.split('\n').filter(Boolean).pop() ?? 'Falha ao conectar.'
      if (/permission denied|publickey/i.test(raw)) {
        message = 'Chave recusada. A conexão exige autenticação por chave já autorizada no host.'
      } else if (/timed out|timeout/i.test(raw)) {
        message = 'Tempo esgotado. Verifique host, porta e firewall.'
      } else if (/could not resolve|name or service/i.test(raw)) {
        message = 'Host não encontrado.'
      }
      resolve({ ok: false, message })
    })
  })
}

// ---------------------------------------------------------------- shim

/**
 * Porta e chave não cabem em `--ssh user@host`, que é tudo o que a extensão
 * oficial aceita — ela chama `ssh <host> <cmd>` direto.
 *
 * Em vez de escrever no `~/.ssh/config` do usuário, geramos um `ssh` próprio num
 * diretório que entra na frente do PATH **apenas do processo do agente**. Ele
 * repassa tudo para o ssh real acrescentando `-p` e `-i`. Nada global, nada
 * persistente no ambiente do usuário.
 */
export async function prepareSshShim(conn: {
  port?: number
  identity?: string
}): Promise<string | null> {
  if (!conn.port && !conn.identity) return null

  const dir = join(app.getPath('userData'), 'ssh-shim')
  await mkdir(dir, { recursive: true })

  const opts: string[] = []
  if (conn.port) opts.push('-p', String(conn.port))
  if (conn.identity) opts.push('-i', JSON.stringify(expandHome(conn.identity)))

  const script = `#!/bin/sh
# Gerado pelo Prime Desk. Repassa para o ssh real com porta/chave da conexão.
exec /usr/bin/ssh ${opts.join(' ')} "$@"
`
  const file = join(dir, 'ssh')
  await writeFile(file, script, 'utf-8')
  await chmod(file, 0o755)
  return dir
}
