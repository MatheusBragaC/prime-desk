import { useState, type RefObject } from 'react'
import {
  FolderInput, Pin, PinOff, Pencil, Copy, FolderOpen, Archive, ArchiveRestore,
  Trash2, ChevronRight, ExternalLink
} from 'lucide-react'
import type { SessionSummary } from '../../../shared/protocol'
import { useAgent, mutateFolders, refreshSessions, rpc, deleteSession } from '../store/agent'
import type { Group } from '../lib/grouping'
import { usePopover } from '../lib/usePopover'
import { useT } from '../i18n'

interface Props {
  session: SessionSummary
  groups: Group[]
  isActive: boolean
  onClose: () => void
  onOpen: () => void
  onRename: () => void
  /** Botão "⋯" da linha: fica fora do menu, então precisa ser excluído do clique fora. */
  trigger: RefObject<HTMLElement | null>
}

const item =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg'

export function SessionMenu({ session, groups, isActive, onClose, onOpen, onRename, trigger }: Props) {
  const folders = useAgent((s) => s.folders)
  const notify = useAgent((s) => s.notify)
  const { t } = useT()
  const [submenu, setSubmenu] = useState(false)
  const requestConfirm = useAgent((s) => s.requestConfirm)
  const ref = usePopover<HTMLDivElement>(onClose, true, trigger)

  const pinned = Boolean(folders.pinned?.[session.id])
  const archived = Boolean(folders.archived?.[session.id])

  async function moveTo(folderId: string | null) {
    await mutateFolders((s) => {
      const assignments = { ...s.assignments }
      if (folderId) assignments[session.id] = folderId
      else delete assignments[session.id]
      return { ...s, assignments }
    })
    onClose()
  }

  async function togglePin() {
    await mutateFolders((s) => {
      const next = { ...(s.pinned ?? {}) }
      if (pinned) delete next[session.id]
      else next[session.id] = true
      return { ...s, pinned: next }
    })
    onClose()
  }

  async function toggleArchive() {
    await mutateFolders((s) => {
      const next = { ...(s.archived ?? {}) }
      if (archived) delete next[session.id]
      else next[session.id] = true
      return { ...s, archived: next }
    })
    onClose()
  }

  async function duplicate() {
    // `clone` age sobre a sessão ativa: só faz sentido para ela.
    const out = await rpc('clone')
    if (out === null) notify('error', 'Não foi possível duplicar esta conversa.')
    else {
      notify('info', 'Conversa duplicada.')
      void refreshSessions()
    }
    onClose()
  }

  /** Limpa o estado de apresentação que a GUI guardava para esta conversa. */
  async function forgetLocalState() {
    await mutateFolders((s) => {
      const assignments = { ...s.assignments }
      const pin = { ...(s.pinned ?? {}) }
      const arc = { ...(s.archived ?? {}) }
      const titles = { ...(s.titles ?? {}) }
      delete assignments[session.id]
      delete pin[session.id]
      delete arc[session.id]
      delete titles[session.id]
      return { ...s, assignments, pinned: pin, archived: arc, titles }
    })
  }

  function askRemove() {
    onClose()
    requestConfirm({
      title: t('delete.title'),
      message: isActive ? t('delete.activeMsg') : t('delete.msg'),
      detail: session.title,
      confirmLabel: t('menu.delete'),
      danger: true,
      onConfirm: async () => {
        const ok = await deleteSession(session.id, session.path)
        if (ok) await forgetLocalState()
      }
    })
  }

  const folderGroups = groups.filter((g) => g.kind === 'folder')

  return (
    <div
      ref={ref}
      className="absolute right-1 top-7 z-dropdown w-[218px] animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70"
    >
      <button className={item} onClick={onOpen}>
        <ExternalLink size={14} strokeWidth={1.75} />
        {t('menu.open')}
      </button>

      <button className={item} onClick={() => void togglePin()}>
        {pinned ? <PinOff size={14} strokeWidth={1.75} /> : <Pin size={14} strokeWidth={1.75} />}
        {pinned ? t('menu.unpin') : t('menu.pin')}
      </button>

      <button className={item} onClick={onRename}>
        <Pencil size={14} strokeWidth={1.75} />
        {t('menu.rename')}
      </button>

      <button
        className={item + (isActive ? '' : ' pointer-events-none opacity-40')}
        onClick={() => void duplicate()}
        title={isActive ? t('menu.duplicateHint') : t('menu.duplicateOnlyActive')}
      >
        <Copy size={14} strokeWidth={1.75} />
        {t('menu.duplicate')}
      </button>

      <div className="my-1 border-t border-[var(--p-line)]" />

      <div className="relative">
        <button className={item} onClick={() => setSubmenu((v) => !v)}>
          <FolderInput size={14} strokeWidth={1.75} />
          <span className="flex-1">{t('menu.moveToFolder')}</span>
          <ChevronRight size={14} strokeWidth={1.75} className={submenu ? 'rotate-90' : ''} />
        </button>
        {submenu && (
          <div className="mt-0.5 pl-2">
            {folderGroups.length === 0 && (
              <div className="px-2 py-1 text-xs italic text-dim">{t('menu.noFolders')}</div>
            )}
            {folderGroups.map((g) => (
              <button key={g.key} className={item} onClick={() => void moveTo(g.folderId!)}>
                <FolderOpen size={14} strokeWidth={1.75} />
                <span className="truncate">{g.label}</span>
              </button>
            ))}
            <button className={item} onClick={() => void moveTo(null)}>
              <Trash2 size={14} strokeWidth={1.75} />
              {t('menu.removeFromFolder')}
            </button>
          </div>
        )}
      </div>

      <button className={item} onClick={() => void toggleArchive()}>
        {archived ? <ArchiveRestore size={14} strokeWidth={1.75} /> : <Archive size={14} strokeWidth={1.75} />}
        {archived ? t('menu.unarchive') : t('menu.archive')}
      </button>

      <div className="my-1 border-t border-[var(--p-line)]" />

      <button className={item + ' text-err hover:text-err'} onClick={askRemove}>
        <Trash2 size={14} strokeWidth={1.75} />
        {t('menu.delete')}
      </button>
    </div>
  )
}
