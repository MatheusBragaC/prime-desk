import {
  Eye, EyeOff, FolderPlus, RefreshCw, SquarePen, WandSparkles
} from 'lucide-react'
import { newSession, refreshSessions } from '../../store/agent'
import type { TitlingProgress } from '../../lib/useTitleBatch'
import { useT } from '../../i18n'

/**
 * Bloco de ações do topo da sidebar.
 *
 * "Nova conversa" como linha de menu, não como botão preenchido: no Claude
 * Desktop nada na sidebar compete com o conteúdo. As ações secundárias
 * (nova pasta, arquivadas, títulos, recarregar) só aparecem no hover do bloco.
 */
export function SidebarActions({
  untitledCount,
  titling,
  archivedCount,
  showArchived,
  onToggleArchived,
  onNewFolder,
  onTitleAll
}: {
  untitledCount: number
  titling: TitlingProgress
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  onNewFolder: () => void
  onTitleAll: () => void
}) {
  const { t } = useT()

  return (
    <div className="group/act px-2 pb-1">
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => void newSession()}
          className="no-drag flex flex-1 items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm text-fg transition-colors hover:bg-elevated"
        >
          <SquarePen size={16} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
          {t('sidebar.newChat')}
        </button>

        <button
          onClick={onNewFolder}
          className="no-drag shrink-0 rounded-sm p-1.5 text-dim opacity-0 transition-all hover:bg-elevated hover:text-muted group-hover/act:opacity-100"
          title={t('sidebar.newFolder')}
        >
          <FolderPlus size={16} strokeWidth={1.75} />
        </button>
        {archivedCount > 0 && (
          <button
            onClick={onToggleArchived}
            className={
              'no-drag shrink-0 rounded-sm p-1.5 transition-all hover:bg-elevated hover:text-muted ' +
              (showArchived ? 'text-muted opacity-100' : 'text-dim opacity-0 group-hover/act:opacity-100')
            }
            title={showArchived ? t('sidebar.hideArchived') : t('sidebar.showArchived')}
          >
            {showArchived ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        )}
        {/*
          Só aparece quando há conversa sem nome — e some quando não há mais.
          Um botão permanente que não faz nada na maioria dos cliques seria
          pior que a ausência dele.
        */}
        {(untitledCount > 0 || titling) && (
          <button
            onClick={onTitleAll}
            disabled={Boolean(titling)}
            className={
              'no-drag shrink-0 rounded-sm p-1.5 transition-all hover:bg-elevated hover:text-muted ' +
              (titling
                ? 'text-primary opacity-100'
                : 'text-dim opacity-0 group-hover/act:opacity-100')
            }
            title={
              titling
                ? t('sidebar.titlingProgress', { done: titling.done, total: titling.total })
                : t('sidebar.titleAll', { n: untitledCount })
            }
          >
            <WandSparkles
              size={16} strokeWidth={1.75}
              className={titling ? 'animate-pulse-soft' : ''}
            />
          </button>
        )}

        <button
          onClick={() => void refreshSessions()}
          className="no-drag shrink-0 rounded-sm p-1.5 text-dim opacity-0 transition-all hover:bg-elevated hover:text-muted group-hover/act:opacity-100"
          title={t('sidebar.reload')}
        >
          <RefreshCw size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
