import { readdir, stat, open, writeFile, rename, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { join, relative, resolve, sep } from 'node:path'
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

/** Pastas que só poluem a árvore. Continuam acessíveis se digitadas no filtro. */
const NOISY = new Set(['.git', '.cache', '__pycache__', '.pytest_cache', '.mypy_cache'])

export async function listDir(root: string, relPath = ''): Promise<{
  ok: boolean
  entries?: DirEntry[]
  error?: string
}> {
  const target = resolve(join(root, relPath))
  if (!insideRoot(root, target)) {
    return { ok: false, error: 'Caminho fora do diretório de trabalho.' }
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
          const st = await stat(full)
          isDir = st.isDirectory()
          size = st.size
          if (!insideRoot(root, resolve(full))) continue
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
        path: relative(root, join(target, d.name)),
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
  const target = resolve(join(root, relPath))
  if (!insideRoot(root, target)) return { ok: false, error: 'Caminho fora do diretório de trabalho.' }

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
  const target = resolve(join(root, relPath))
  if (!insideRoot(root, target)) return { ok: false, error: 'Caminho fora do diretório de trabalho.' }
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
  if (!insideRoot(agentDir, path)) return { ok: false, error: 'Fora do diretório do agente.' }
  return { ok: false, error: 'Renomear arquivo de sessão não é suportado.' }
}

export async function deleteSessionFile(
  agentDir: string,
  path: string
): Promise<{ ok: boolean; error?: string }> {
  if (!insideRoot(agentDir, path) || !path.endsWith('.jsonl')) {
    return { ok: false, error: 'Caminho inválido para exclusão.' }
  }
  try {
    await unlink(path)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

void rename
