import { useState } from 'react'
import { Plus, ChevronRight, Trash2, Pencil } from 'lucide-react'
import { useAgent, newSession, mutateFolders } from '../../store/agent'
import type { Group } from '../../lib/grouping'
import { InlineEdit } from '../ui/InlineEdit'
import { useT } from '../../i18n'

export function GroupHeader({
  group,
  collapsed,
  onToggle
}: {
  group: Group
  collapsed: boolean
  onToggle: () => void
}) {
  const { t } = useT()
  const [renaming, setRenaming] = useState(false)

  async function commitRename(name: string) {
    setRenaming(false)
    if (!name || !group.folderId || name === group.label) return
    await mutateFolders((s) => ({
      ...s,
      folders: s.folders.map((f) => (f.id === group.folderId ? { ...f, name } : f))
    }))
  }

  async function removeFolder() {
    if (!group.folderId) return
    await mutateFolders((s) => {
      const assignments = { ...s.assignments }
      for (const [sid, fid] of Object.entries(assignments)) {
        if (fid === group.folderId) delete assignments[sid]
      }
      return { ...s, folders: s.folders.filter((f) => f.id !== group.folderId), assignments }
    })
  }

  async function newHere() {
    // Sessão nova já nasce dentro da pasta clicada.
    await newSession()
    if (!group.folderId) return
    const sid = useAgent.getState().state?.sessionId
    if (!sid) return
    await mutateFolders((s) => ({
      ...s,
      assignments: { ...s.assignments, [sid]: group.folderId! }
    }))
  }

  return (
    /*
      `pt-5 pb-1.5` em vez de `pt-4 pb-1`: o cabeçalho ficava à mesma distância
      do próprio grupo e do grupo anterior, então a lista lia como uma coluna
      única de texto. Com o respiro assimétrico, cada projeto vira um bloco.
    */
    <div className="group/h flex items-center gap-1 px-2 pb-1.5 pt-5">
      <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-1 text-left">
        <ChevronRight
          size={14} strokeWidth={1.75}
          className={
            'shrink-0 text-dim opacity-0 transition-all duration-200 group-hover/h:opacity-100 ' +
            (collapsed ? '' : 'rotate-90')
          }
        />
        {renaming ? (
          <InlineEdit
            size="sm"
            value={group.label}
            onCommit={(name) => void commitRename(name)}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <span className="truncate text-xs font-medium tracking-wide text-muted">
              {group.label}
            </span>
            {/*
              Contagem discreta. Vale porque o grupo pode estar recolhido, e
              porque com dez projetos abertos saber onde está o volume de
              conversa é mais rápido de ler que contar linha.
            */}
            <span className="shrink-0 font-mono text-micro text-dim">
              {group.sessions.length}
            </span>
          </>
        )}
      </button>

      <button
        onClick={() => void newHere()}
        className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
        title={t('sidebar.newChat')}
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>

      {group.kind === 'folder' && (
        <>
          <button
            onClick={() => setRenaming(true)}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover/h:opacity-100"
            title={t('menu.rename')}
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => void removeFolder()}
            className="shrink-0 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover/h:opacity-100"
            title={t('menu.delete')}
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </>
      )}
    </div>
  )
}
