import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionSummary } from '../shared/protocol.js'

const AGENT_DIR = join(homedir(), '.prime', 'agent')
const SESSIONS_DIR = join(AGENT_DIR, 'sessions')

/** Quantos bytes ler do início do arquivo para inferir título. */
const HEAD_BYTES = 64_000

interface HeaderLine {
  type: string
  version?: number
  id?: string
  timestamp?: string
  cwd?: string
}

function firstUserText(lines: string[]): { title: string; count: number; name: string } {
  let title = ''
  let name = ''
  let count = 0
  for (const line of lines) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    const type = obj.type as string | undefined

    // Nome explícito da sessão (definido via /title ou set_session_name) ganha
    // do texto da primeira mensagem.
    if (type === 'session_info') {
      const n = obj.name
      if (typeof n === 'string' && n.trim()) name = n.trim()
      continue
    }

    if (type !== 'message') continue
    count += 1
    if (title) continue

    const message = obj.message as { role?: string; content?: unknown } | undefined
    if (message?.role !== 'user') continue

    const content = message.content
    if (typeof content === 'string') {
      title = content
    } else if (Array.isArray(content)) {
      const textBlock = content.find(
        (b): b is { type: string; text: string } =>
          typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text'
      )
      if (textBlock) title = textBlock.text
    }
  }
  return { title, count, name }
}

function cleanTitle(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim()
  if (!flat) return 'Sessão sem título'
  return flat.length > 90 ? flat.slice(0, 90) + '…' : flat
}

/**
 * Lê o catálogo de sessões direto do disco.
 * Evita subir um worker do daemon só para listar. Ver docs/MAPEAMENTO.md §7.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  let files: string[]
  try {
    files = await readdir(SESSIONS_DIR)
  } catch {
    return []
  }

  const out: SessionSummary[] = []

  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const path = join(SESSIONS_DIR, file)
    try {
      const info = await stat(path)
      const buf = await readFile(path, 'utf-8')
      const head = buf.length > HEAD_BYTES ? buf.slice(0, HEAD_BYTES) : buf
      const lines = head.split('\n').filter((l) => l.trim().length > 0)
      if (lines.length === 0) continue

      let header: HeaderLine = { type: 'session' }
      try {
        header = JSON.parse(lines[0]) as HeaderLine
      } catch {
        /* header ilegível: segue com defaults */
      }
      if (header.type !== 'session') continue

      const { title, count, name } = firstUserText(lines)

      // Toda inicialização do agente cria um arquivo de sessão com header e
      // nenhuma mensagem. Listar isso enche a sidebar de "Sessão sem título"
      // que o usuário nunca criou. A sessão aparece assim que tiver conteúdo.
      if (count === 0) continue

      out.push({
        id: header.id ?? file.replace(/\.jsonl$/, ''),
        path,
        cwd: header.cwd ?? '',
        createdAt: header.timestamp ?? info.birthtime.toISOString(),
        updatedAt: info.mtime.toISOString(),
        title: cleanTitle(name || title),
        messageCount: count,
        sizeBytes: info.size
      })
    } catch {
      /* arquivo ilegível ou removido durante a varredura: ignora */
    }
  }

  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

export const paths = { AGENT_DIR, SESSIONS_DIR }
