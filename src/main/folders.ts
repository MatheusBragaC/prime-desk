import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { FolderState } from '../shared/protocol.js'

/**
 * Organização de conversas em pastas.
 *
 * Persistido só no lado da GUI: o prime-agent não tem conceito de pasta e não
 * deve ser poluído com metadado de apresentação. Guardamos apenas ids de sessão
 * e nomes de pasta — nenhum conteúdo de conversa é copiado para cá.
 */

const EMPTY: FolderState = { folders: [], assignments: {}, collapsed: {} }

function filePath(): string {
  return join(app.getPath('userData'), 'folders.json')
}

export async function loadFolders(): Promise<FolderState> {
  try {
    const raw = await readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<FolderState>
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      assignments: parsed.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {},
      collapsed: parsed.collapsed && typeof parsed.collapsed === 'object' ? parsed.collapsed : {}
    }
  } catch {
    return { ...EMPTY }
  }
}

export async function saveFolders(state: FolderState): Promise<FolderState> {
  const path = filePath()
  await mkdir(dirname(path), { recursive: true })
  const clean: FolderState = {
    folders: state.folders
      .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
      .map((f) => ({ id: f.id, name: f.name.slice(0, 60), order: f.order ?? 0 })),
    assignments: state.assignments ?? {},
    collapsed: state.collapsed ?? {}
  }
  await writeFile(path, JSON.stringify(clean, null, 2), 'utf-8')
  return clean
}
