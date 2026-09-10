import { useState } from 'react'
import { useAgent, mutateFolders } from '@/store/agent'
import type { Group } from '@/lib/grouping'
import { GroupHeader } from './GroupHeader'
import { SessionRow } from './SessionRow'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useT } from '@/i18n'

/**
 * Conversas mostradas por grupo antes do "mostrar mais".
 *
 * Um grupo de projeto ativo passa fácil de vinte conversas, e a lista inteira
 * virava uma parede onde os outros projetos ficavam abaixo da dobra. Doze
 * linhas de 33px dão ~400px — perto de uma tela de lista na altura típica da
 * janela, então cada projeto ocupa no máximo uma "página" antes de pedir mais.
 *
 * Busca ignora o limite: esconder resultado atrás de um botão seria hostil.
 */
const PER_GROUP = 12

export function SessionList({
  groups,
  activeId,
  busy,
  searching,
  inUseIds,
  runningPaths,
  onOpen,
  creating,
  onCreateFolder,
  onCancelCreate
}: {
  groups: Group[]
  activeId?: string
  /** Alguma conversa está sendo aberta: as linhas ficam inertes. */
  busy: boolean
  /** Com busca ativa nenhum grupo é paginado. */
  searching: boolean
  inUseIds: Set<string>
  runningPaths: Set<string>
  onOpen: (path: string) => void
  creating: boolean
  onCreateFolder: (name: string) => void
  onCancelCreate: () => void
}) {
  const { t } = useT()
  const collapsedMap = useAgent((s) => s.folders.collapsed)
  /*
    Grupos expandidos além do limite. Não é persistido de propósito: é escolha
    de momento, e guardar traria mais um estado para sincronizar com pastas que
    podem deixar de existir.
  */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function toggleGroup(key: string) {
    await mutateFolders((s) => ({
      ...s,
      collapsed: { ...s.collapsed, [key]: !s.collapsed[key] }
    }))
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
      {creating && (
        <div className="px-2 pb-1 pt-2">
          <InlineEdit
            size="lg"
            placeholder={t('sidebar.folderName')}
            onCommit={onCreateFolder}
            onCancel={onCancelCreate}
          />
        </div>
      )}
      {groups.length === 0 && !creating && (
        <div className="px-2 py-6 text-center text-sm text-dim">{t('sidebar.empty')}</div>
      )}
      {groups.map((g) => {
        const collapsed = collapsedMap[g.key] ?? false
        const showAll = searching || expanded.has(g.key)
        const shown = showAll ? g.sessions : g.sessions.slice(0, PER_GROUP)
        const hidden = g.sessions.length - shown.length

        return (
          <div key={g.key}>
            <GroupHeader group={g} collapsed={collapsed} onToggle={() => void toggleGroup(g.key)} />
            {!collapsed && (
              <>
                {shown.map((s) => (
                  <SessionRow
                    key={s.id}
                    s={s}
                    active={activeId === s.id}
                    busy={busy}
                    inUse={inUseIds.has(s.id)}
                    running={runningPaths.has(s.path)}
                    onOpen={() => onOpen(s.path)}
                    groups={groups}
                  />
                ))}

                {(hidden > 0 || (showAll && !searching && g.sessions.length > PER_GROUP)) && (
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(g.key)) next.delete(g.key)
                        else next.add(g.key)
                        return next
                      })
                    }
                    /* Alinhado com o texto das linhas, não com o trilho: é
                       ação da lista, não item dela. */
                    className="mb-px flex h-7 w-full items-center rounded-md pl-8 pr-2 text-left text-xs text-dim transition-colors hover:bg-elevated hover:text-muted"
                  >
                    {hidden > 0 ? t('sidebar.showMore', { n: hidden }) : t('sidebar.showLess')}
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
