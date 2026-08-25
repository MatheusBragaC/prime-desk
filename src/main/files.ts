import { readdir, stat, open, writeFile, rename, unlink, realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import type { DirEntry } from '../shared/protocol.js'

/**
 * Navegação de arquivos do diretório de trabalho.
 *
 * Regra dura: tudo é resolvido e validado contra a raiz. Um `relPath` com `..`
 * ou um symlink apontando para fora é recusado — o painel é um explorador do
 * workspace, não um leitor de disco genérico.
 */
export function insideRoot(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r + sep)
}

const OUTSIDE = 'Caminho fora do diretório de trabalho.'

async function realpathOr(p: string): Promise<string> {
  try {
    return await realpath(p)
  } catch {
    return resolve(p)
  }
}

/**
 * Resolve `target` seguindo symlinks e confirma que o resultado segue dentro de
 * `root`.
 *
 * `insideRoot` sozinho não basta: `path.resolve` é textual e não enxerga
 * symlink, então um `ws/atalho -> ../../.ssh/id_rsa` passava pela checagem e a
 * leitura saía do workspace. A raiz também é resolvida, senão um `~` que seja
 * link — comum em ambiente gerenciado — reprovaria caminho legítimo.
 *
 * Devolve o caminho REAL, e é ele que deve ser aberto: reabrir o caminho
 * original seguiria o symlink de novo, reabrindo a janela de troca entre a
 * validação e o `open`.
 */
export async function realPathInside(root: string, target: string): Promise<string | null> {
  const realRoot = await realpathOr(root)
  const abs = resolve(target)

  let real: string
  try {
    real = await realpath(abs)
  } catch {
    // Alvo pode ainda não existir (gravação nova): vale o pai já resolvido.
    real = join(await realpathOr(dirname(abs)), basename(abs))
  }

  return insideRoot(realRoot, real) ? real : null
}

/** Pastas que só poluem a árvore. Continuam acessíveis se digitadas no filtro. */
const NOISY = new Set(['.git', '.cache', '__pycache__', '.pytest_cache', '.mypy_cache'])

export async function listDir(root: string, relPath = ''): Promise<{
  ok: boolean
  entries?: DirEntry[]
  error?: string
}> {
  /**
   * Dois caminhos, de propósito: o lógico alimenta os `path` devolvidos ao
   * renderer (que os manda de volta como `relPath`), e o real é o que abrimos.
   * Misturar os dois quebraria a navegação quando a própria raiz for um link.
   */
  const logical = resolve(join(root, relPath))
  const target = await realPathInside(root, logical)
  if (!target) {
    return { ok: false, error: OUTSIDE }
  }

  try {
    const raw = await readdir(target, { withFileTypes: true })
    const entries: DirEntry[] = []

    for (const d of raw) {
      if (NOISY.has(d.name)) continue

      let isDir = d.isDirectory()
      let size = 0

      if (d.isSymbolicLink()) {
        // Symlink que escapa da raiz não entra na listagem.
        try {
          const full = join(target, d.name)
          if (!(await realPathInside(root, full))) continue
          const st = await stat(full)
          isDir = st.isDirectory()
          size = st.size
        } catch {
          continue
        }
      } else if (!isDir) {
        try {
          size = (await stat(join(target, d.name))).size
        } catch {
          size = 0
        }
      }

      entries.push({
        name: d.name,
        path: relative(root, join(logical, d.name)),
        isDir,
        size
      })
    }

    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      const dotA = a.name.startsWith('.')
      const dotB = b.name.startsWith('.')
      if (dotA !== dotB) return dotA ? -1 : 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })

    return { ok: true, entries }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Branch atual, para a barra de contexto. Silencioso fora de repositório. */
export function gitBranch(cwd: string): Promise<string | null> {
  return new Promise((res) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, timeout: 4000 },
      (err, stdout) => {
        if (err) return res(null)
        const branch = stdout.trim()
        res(branch && branch !== 'HEAD' ? branch : null)
      }
    )
  })
}

const MAX_READ_BYTES = 1_000_000

export interface FileRead {
  ok: boolean
  content?: string
  size?: number
  truncated?: boolean
  binary?: boolean
  error?: string
}

/** Lê um arquivo do workspace. Recusa binário e trunca acima do limite. */
export async function readFileSafe(root: string, relPath: string): Promise<FileRead> {
  const target = await realPathInside(root, join(root, relPath))
  if (!target) return { ok: false, error: OUTSIDE }

  try {
    const st = await stat(target)
    if (st.isDirectory()) return { ok: false, error: 'É um diretório.' }

    const fh = await open(target, 'r')
    try {
      const length = Math.min(st.size, MAX_READ_BYTES)
      const buf = Buffer.alloc(length)
      await fh.read(buf, 0, length, 0)

      // Byte nulo no início é o sinal prático de binário.
      if (buf.subarray(0, Math.min(length, 8000)).includes(0)) {
        return { ok: true, binary: true, size: st.size }
      }

      return {
        ok: true,
        content: buf.toString('utf-8'),
        size: st.size,
        truncated: st.size > MAX_READ_BYTES,
        binary: false
      }
    } finally {
      await fh.close()
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Grava um arquivo do workspace. Nunca cria fora da raiz. */
export async function writeFileSafe(
  root: string,
  relPath: string,
  content: string
): Promise<{ ok: boolean; error?: string; size?: number }> {
  const target = await realPathInside(root, join(root, relPath))
  if (!target) return { ok: false, error: OUTSIDE }
  try {
    const st = await stat(target)
    if (st.isDirectory()) return { ok: false, error: 'É um diretório.' }
    await writeFile(target, content, 'utf-8')
    return { ok: true, size: Buffer.byteLength(content, 'utf-8') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Renomeia/exclui arquivos de sessão. Restrito ao diretório do agente. */
export async function renameSessionFile(
  agentDir: string,
  path: string,
  _newName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(await realPathInside(agentDir, path))) {
    return { ok: false, error: 'Fora do diretório do agente.' }
  }
  return { ok: false, error: 'Renomear arquivo de sessão não é suportado.' }
}

export async function deleteSessionFile(
  agentDir: string,
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const target = await realPathInside(agentDir, path)
  if (!target || !target.endsWith('.jsonl')) {
    return { ok: false, error: 'Caminho inválido para exclusão.' }
  }
  try {
    await unlink(target)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

void rename

// ------------------------------------------------------------------ git diff

/** Teto do diff devolvido ao renderer: acima disso a leitura deixa de ser útil. */
const MAX_DIFF_BYTES = 400_000

export interface GitChange {
  /** Caminho relativo à raiz do repositório. */
  path: string
  /** Código de duas letras do `git status --porcelain` (ex.: ` M`, `A `, `??`). */
  status: string
  added: number
  removed: number
}

function git(cwd: string, args: string[], maxBuffer = MAX_DIFF_BYTES): Promise<string | null> {
  return new Promise((res) => {
    execFile('git', args, { cwd, timeout: 8000, maxBuffer }, (err, stdout) => {
      // `git diff` sai com 1 quando há diferenças: não é erro.
      if (err && (err as { code?: number }).code !== 1) return res(null)
      res(stdout)
    })
  })
}

/**
 * Arquivos alterados no diretório de trabalho, com contagem de linhas.
 *
 * `--porcelain` traz o estado (inclusive não rastreados, que o `--numstat` não
 * vê); `--numstat` traz as contagens. Os dois são unidos pelo caminho.
 */
export async function gitChanges(cwd: string): Promise<{ ok: boolean; changes?: GitChange[]; error?: string }> {
  /*
    `--untracked-files=normal` (o padrão) colapsa uma pasta nova numa linha só.
    Com `=all`, um diretório de saída como `graphify-out/` despejava dezenas de
    entradas e enterrava as alterações que importam.
  */
  const porcelain = await git(cwd, ['status', '--porcelain=v1'])
  if (porcelain === null) return { ok: false, error: 'not-a-repo' }

  const counts = new Map<string, { added: number; removed: number }>()
  const numstat = await git(cwd, ['diff', 'HEAD', '--numstat'])
  for (const line of (numstat ?? '').split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
    if (!m) continue
    counts.set(m[3], {
      added: m[1] === '-' ? 0 : Number(m[1]),
      removed: m[2] === '-' ? 0 : Number(m[2])
    })
  }

  const changes: GitChange[] = []
  for (const line of porcelain.split('\n')) {
    if (line.length < 4) continue
    const status = line.slice(0, 2)
    // Renomeio vem como "antigo -> novo": só o destino interessa.
    const path = line.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, '')
    const c = counts.get(path) ?? { added: 0, removed: 0 }
    changes.push({ path, status, added: c.added, removed: c.removed })
  }
  changes.sort((a, b) => a.path.localeCompare(b.path))
  return { ok: true, changes }
}

/**
 * Diff de um arquivo, ou do repositório inteiro quando `relPath` é omitido.
 *
 * Arquivo não rastreado não tem diff contra HEAD; nesse caso o `--no-index`
 * contra /dev/null produz a mesma saída, com todas as linhas como adição.
 */
export async function gitDiff(
  root: string,
  relPath?: string
): Promise<{ ok: boolean; diff?: string; truncated?: boolean; error?: string }> {
  // Mesma regra do explorador: nada fora da raiz, nem por symlink.
  if (relPath) {
    const real = await realPathInside(root, join(root, relPath))
    if (!real) return { ok: false, error: OUTSIDE }
  }

  const args = relPath
    ? ['diff', 'HEAD', '--', relPath]
    : ['diff', 'HEAD']
  let out = await git(root, args)

  if (relPath && (out === null || out.trim() === '')) {
    out = await git(root, ['diff', '--no-index', '--', '/dev/null', relPath])
  }
  if (out === null) return { ok: false, error: 'not-a-repo' }

  const truncated = out.length > MAX_DIFF_BYTES
  return { ok: true, diff: truncated ? out.slice(0, MAX_DIFF_BYTES) : out, truncated }
}
