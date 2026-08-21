import type { SessionSummary, FolderState } from '../../../shared/protocol'

export interface Group {
  key: string
  label: string
  /** Pasta criada pelo usuário (permite renomear/remover) ou grupo automático por cwd. */
  kind: 'folder' | 'auto'
  folderId?: string
  sessions: SessionSummary[]
}

/** Nome curto do projeto a partir do diretório de trabalho da sessão. */
export function projectOf(cwd: string, home: string): string {
  if (!cwd) return 'Sem projeto'
  if (cwd === home) return 'Home'
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] || 'Raiz'
}

/** Aplica título renomeado na GUI, se houver. */
export function withTitles(sessions: SessionSummary[], state: FolderState): SessionSummary[] {
  const titles = state.titles ?? {}
  if (Object.keys(titles).length === 0) return sessions
  return sessions.map((s) => (titles[s.id] ? { ...s, title: titles[s.id] } : s))
}

/**
 * Agrupa sessões para a sidebar.
 *
 * Precedência: atribuição manual a pasta vence. O resto cai em grupos
 * automáticos derivados do `cwd`, que na prática são os projetos.
 * Fixadas sobem dentro do próprio grupo; arquivadas são filtradas antes.
 */
export function groupSessions(
  sessions: SessionSummary[],
  state: FolderState,
  home: string
): Group[] {
  const pinned = state.pinned ?? {}
  const byPin = (a: SessionSummary, b: SessionSummary) => {
    const pa = pinned[a.id] ? 1 : 0
    const pb = pinned[b.id] ? 1 : 0
    if (pa !== pb) return pb - pa
    return b.updatedAt.localeCompare(a.updatedAt)
  }
  const byFolder = new Map<string, SessionSummary[]>()
  const auto = new Map<string, SessionSummary[]>()

  for (const s of sessions) {
    const folderId = state.assignments[s.id]
    if (folderId && state.folders.some((f) => f.id === folderId)) {
      const list = byFolder.get(folderId) ?? []
      list.push(s)
      byFolder.set(folderId, list)
      continue
    }
    const key = projectOf(s.cwd, home)
    const list = auto.get(key) ?? []
    list.push(s)
    auto.set(key, list)
  }

  const folderGroups: Group[] = [...state.folders]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((f) => ({
      key: 'folder:' + f.id,
      label: f.name,
      kind: 'folder' as const,
      folderId: f.id,
      sessions: (byFolder.get(f.id) ?? []).sort(byPin)
    }))

  const autoGroups: Group[] = [...auto.entries()]
    .map(([label, list]) => ({
      key: 'auto:' + label,
      label,
      kind: 'auto' as const,
      sessions: list.sort(byPin)
    }))
    .sort((a, b) => {
      // Grupos com atividade mais recente primeiro.
      const at = a.sessions[0]?.updatedAt ?? ''
      const bt = b.sessions[0]?.updatedAt ?? ''
      return bt.localeCompare(at)
    })

  return [...folderGroups, ...autoGroups]
}
