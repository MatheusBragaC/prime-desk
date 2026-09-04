import { useCallback, useMemo, useState } from 'react'
import {
  ChevronRight, Folder, FolderOpen, FileCode2, FileText, FileJson, Image as ImageIcon,
  Search, X, RefreshCw, ExternalLink, FolderTree, AtSign
} from 'lucide-react'
import type { DirEntry } from '../../../shared/protocol'
import { fmtSize } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { unwrap } from '../lib/ipc'
import { DockPanel } from './DockPanel'
import { PanelEmpty, PanelError, PanelLoading } from './PanelState'
import { useT } from '../i18n'

const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'bash', 'sql', 'css', 'scss', 'html', 'vue', 'svelte'])
const DATA = new Set(['json', 'yml', 'yaml', 'toml', 'ini', 'env', 'lock'])
const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'])

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMG.has(ext)) return <ImageIcon size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
  if (DATA.has(ext)) return <FileJson size={14} strokeWidth={1.75} className="shrink-0 text-warn" />
  if (CODE.has(ext)) return <FileCode2 size={14} strokeWidth={1.75} className="shrink-0 text-info" />
  return <FileText size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
}

interface NodeProps {
  entry: DirEntry
  level: number
  filter: string
  onOpen: (e: DirEntry) => void
  onQuote: (e: DirEntry) => void
}

function Node({ entry, level, filter, onOpen, onQuote }: NodeProps) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await window.prime.listFiles(entry.path)
    setChildren(r?.ok ? (r.entries as DirEntry[]) : [])
    setLoading(false)
  }, [entry.path])

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && children === null) await load()
  }

  const visibleChildren = useMemo(() => {
    if (!children) return []
    if (!filter) return children
    const q = filter.toLowerCase()
    return children.filter((c) => c.isDir || c.name.toLowerCase().includes(q))
  }, [children, filter])

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-md py-[3px] pr-2 transition-colors hover:bg-white/[0.045]"
        style={{ paddingLeft: 6 + level * 13 }}
      >
        {entry.isDir ? (
          <>
            <button onClick={() => void toggle()} className="shrink-0">
              <ChevronRight
                size={14} strokeWidth={1.75}
                className={'text-dim transition-transform duration-150 ' + (open ? 'rotate-90' : '')}
              />
            </button>
            <button onClick={() => void toggle()} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              {open ? (
                <FolderOpen size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
              ) : (
                <Folder size={14} strokeWidth={1.75} className="shrink-0 text-muted" />
              )}
              <span className="truncate text-sm text-fg">{entry.name}</span>
              {loading && <RefreshCw size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-dim" />}
            </button>
          </>
        ) : (
          <>
            <span className="w-[11px] shrink-0" />
            <button
              onClick={() => onOpen(entry)}
              title={`${entry.path} · ${fmtSize(entry.size)} — ${t('files.openEditor')}`}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <FileIcon name={entry.name} />
              <span className="truncate text-sm text-muted group-hover:text-fg">{entry.name}</span>
            </button>
            <button
              onClick={() => onQuote(entry)}
              title={t('files.quote')}
              className="shrink-0 text-dim opacity-0 transition-opacity hover:text-primarySoft group-hover:opacity-100"
            >
              <AtSign size={14} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => void window.prime.revealFile(entry.path)}
              title={t('files.openExternal')}
              className="shrink-0 text-dim opacity-0 transition-opacity hover:text-primarySoft group-hover:opacity-100"
            >
              <ExternalLink size={14} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>

      {open && (
        <div>
          {visibleChildren.map((c) => (
            <Node
              key={c.path}
              entry={c}
              level={level + 1}
              filter={filter}
              onOpen={onOpen}
              onQuote={onQuote}
            />
          ))}
          {children !== null && visibleChildren.length === 0 && (
            <div className="py-[3px] text-xs italic text-dim" style={{ paddingLeft: 19 + level * 13 }}>
              {t('files.empty')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FilesPanel({
  onClose,
  onOpenFile,
  onQuote
}: {
  onClose: () => void
  onOpenFile: (path: string) => void
  onQuote: (path: string) => void
}) {
  const { t } = useT()
  const [filter, setFilter] = useState('')

  /*
    Raiz e conteúdo numa carga só. Eram duas chamadas soltas em sequência, e a
    raiz era escrita sem checar se ainda era a corrente — trocar de diretório
    rápido deixava o cabeçalho de um lugar com a lista de outro.
  */
  const tree = useAsync<{ root: string; entries: DirEntry[] }>(async () => {
    // A raiz vem do main: evita o explorador divergir do agente.
    const rootRes = await window.prime.filesRoot()
    const root = rootRes?.ok ? (rootRes.root as string) : ''
    const entries = await unwrap(
      window.prime.listFiles(''),
      (r) => r.entries as DirEntry[],
      t('files.nothing')
    )
    return { root, entries }
  }, [], { keepPrevious: true })

  const root = tree.data?.root ?? ''
  const entries = tree.data?.entries

  const visible = useMemo(() => {
    const list = entries ?? []
    if (!filter) return list
    const q = filter.toLowerCase()
    return list.filter((e) => e.isDir || e.name.toLowerCase().includes(q))
  }, [entries, filter])

  const shortRoot = root.split('/').filter(Boolean).pop() ?? root

  return (
    <DockPanel
      storageKey="files"
      defaultWidth={320}
      min={240}
      max={700}
      icon={<FolderTree size={16} strokeWidth={1.75} className="text-primarySoft" />}
      title={shortRoot}
      onClose={onClose}
      bodyClassName="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
      actions={
        <button
          onClick={() => void tree.reload()}
          className="no-drag text-dim transition-colors hover:text-muted"
          title={t('common.refresh')}
        >
          <RefreshCw
            size={14} strokeWidth={1.75}
            className={tree.loading || tree.refreshing ? 'animate-spin' : ''}
          />
        </button>
      }
      subheader={
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-[9px] border border-[var(--p-line)] bg-black/25 px-2.5 py-1.5 focus-within:border-primary/40">
            <Search size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('files.filter')}
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-dim"
            />
            {filter && (
              <button onClick={() => setFilter('')} className="shrink-0 text-dim hover:text-fg">
                <X size={14} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      }
      footer={
        <div className="border-t border-[var(--p-line)] px-4 py-2 text-micro leading-snug text-dim">
          {t('files.hint')}
        </div>
      }
    >

      {tree.error && <PanelError message={tree.error} />}
      {tree.loading && <PanelLoading />}
      {!tree.error && !tree.loading && visible.length === 0 && (
        <PanelEmpty message={t('files.nothing')} />
      )}
      <div>
        {visible.map((e) => (
          <Node
            key={e.path}
            entry={e}
            level={0}
            filter={filter}
            onOpen={(x) => onOpenFile(x.path)}
            onQuote={(x) => onQuote(x.path)}
          />
        ))}
      </div>
    </DockPanel>
  )
}
