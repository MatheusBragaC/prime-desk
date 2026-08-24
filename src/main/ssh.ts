import { realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'

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
