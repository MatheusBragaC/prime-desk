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

/**
 * Porta TCP.
 *
 * Chega pelo IPC, então o `number` do TypeScript não prova nada em tempo de
 * execução: o renderer pode mandar string, float ou objeto.
 */
export function isValidSshPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536
}

/**
 * Caminho de chave privada.
 *
 * Recusa metacaractere de shell e valor iniciado por `-`: mesmo com o shim já
 * parametrizado por ambiente, um `-oProxyCommand=...` viraria opção do ssh — e
 * o ssh executa ProxyCommand. Validado ANTES de expandir o `~`, para que um
 * diretório home fora do comum não reprove caminho legítimo.
 */
export function isValidIdentityPath(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length <= 512 &&
    !p.startsWith('-') &&
    // Espaço é seguro: o valor viaja por argv e por variável já entre aspas.
    /^[A-Za-z0-9_@+./~ -]+$/.test(p)
  )
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

/**
 * Saneamento único, aplicado na leitura E na escrita.
 *
 * O arquivo vive em `userData` e é editável fora do app, então o que foi
 * gravado um dia não é prova de nada: sem sanear na leitura, um `identity`
 * plantado à mão chegaria ao shim sem passar por validação alguma.
 */
function sanitizeConnections(list: unknown): SshConnection[] {
  if (!Array.isArray(list)) return []

  const clean: SshConnection[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const c = item as Partial<SshConnection>
    if (typeof c.host !== 'string' || !isValidSshTarget(c.host)) continue

    const identity = typeof c.identity === 'string' ? c.identity.trim() : undefined
    const remotePath = typeof c.remotePath === 'string' ? c.remotePath.trim() : undefined

    clean.push({
      id: String(c.id ?? '').slice(0, 40),
      name: String(c.name ?? '').slice(0, 60),
      host: c.host.trim(),
      port: isValidSshPort(c.port) ? c.port : undefined,
      identity: isValidIdentityPath(identity) ? identity : undefined,
      remotePath: remotePath || undefined
    })
  }
  return clean
}

export async function loadConnections(): Promise<SshConnection[]> {
  try {
    const raw = await readFile(connectionsFile(), 'utf-8')
    return sanitizeConnections(JSON.parse(raw))
  } catch {
    return []
  }
}

export async function saveConnections(list: SshConnection[]): Promise<SshConnection[]> {
  const clean = sanitizeConnections(list)
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
    if (conn.port !== undefined && !isValidSshPort(conn.port)) {
      return resolve({ ok: false, message: 'Porta inválida.' })
    }
    // `execFile` não abre shell, mas um valor iniciado por `-` viraria opção do ssh.
    if (conn.identity !== undefined && !isValidIdentityPath(conn.identity)) {
      return resolve({ ok: false, message: 'Caminho de chave inválido.' })
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
export interface SshShim {
  /** Entra na frente do PATH, apenas no processo do agente. */
  dir: string
  /** Valores que o shim lê em tempo de execução. */
  env: Record<string, string>
}

export async function prepareSshShim(conn: {
  port?: number
  identity?: string
}): Promise<SshShim | null> {
  if (conn.port !== undefined && !isValidSshPort(conn.port)) {
    throw new Error('Porta SSH inválida.')
  }
  if (conn.identity !== undefined && !isValidIdentityPath(conn.identity)) {
    throw new Error('Caminho de chave SSH inválido. Use apenas letras, números, "." "_" "-" "/" "~".')
  }

  const port = conn.port
  const identity = conn.identity ? expandHome(conn.identity) : undefined
  if (port === undefined && identity === undefined) return null

  const dir = join(app.getPath('userData'), 'ssh-shim')
  await mkdir(dir, { recursive: true })

  /**
   * Script FIXO: nada vindo do usuário é interpolado aqui.
   *
   * A versão anterior montava `-p <porta>` e `-i <chave>` por interpolação, e
   * isso era injeção de comando. `JSON.stringify` escapa `"` e `\`, mas não `$`
   * nem backtick — exatamente os metacaracteres ativos dentro de aspas duplas
   * no sh — então um `identity` com `$(...)` executava; a porta ia sem aspas
   * nenhuma. Agora os valores viajam por ambiente e o shim os expande já
   * entre aspas.
   *
   * As opções são PREPENDIDAS via `set --` porque o ssh exige opção antes do
   * host, e `set -- ... "$@"` preserva o argumento original palavra por palavra
   * (nada de word splitting sobre caminho com espaço).
   */
  const script = [
    '#!/bin/sh',
    '# Gerado pelo Prime Desk. Repassa para o ssh real com a porta/chave da conexão.',
    '# Os valores vêm do ambiente e nunca são interpolados neste arquivo.',
    'if [ -n "$PRIME_DESK_SSH_IDENTITY" ]; then',
    '  set -- -i "$PRIME_DESK_SSH_IDENTITY" "$@"',
    'fi',
    'if [ -n "$PRIME_DESK_SSH_PORT" ]; then',
    '  set -- -p "$PRIME_DESK_SSH_PORT" "$@"',
    'fi',
    'exec /usr/bin/ssh "$@"',
    ''
  ].join('\n')

  const file = join(dir, 'ssh')
  await writeFile(file, script, 'utf-8')
  await chmod(file, 0o755)

  const env: Record<string, string> = {}
  if (port !== undefined) env.PRIME_DESK_SSH_PORT = String(port)
  if (identity !== undefined) env.PRIME_DESK_SSH_IDENTITY = identity
  return { dir, env }
}
