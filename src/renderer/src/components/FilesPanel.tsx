import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, Folder, FolderOpen, FileCode2, FileText, FileJson, Image as ImageIcon,
  Search, X, RefreshCw, ExternalLink, FolderTree, AtSign
} from 'lucide-react'
import type { DirEntry } from '../../../shared/protocol'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
  const [root, setRoot] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const size = useResizable('files', 320, 240, 700, 'left')

  const reload = useCallback(async () => {
    setLoading(true)
    // A raiz é sempre a do main: evita o explorador divergir do agente.
    const rootRes = await window.prime.filesRoot()
    if (rootRes?.ok) setRoot(rootRes.root as string)
    const r = await window.prime.listFiles('')
    if (r?.ok) {
      setEntries(r.entries as DirEntry[])
      setError(null)
    } else {
      setError(r?.error ?? t('files.nothing'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const visible = useMemo(() => {
    if (!filter) return entries
    const q = filter.toLowerCase()
    return entries.filter((e) => e.isDir || e.name.toLowerCase().includes(q))
  }, [entries, filter])

  const shortRoot = root.split('/').filter(Boolean).pop() ?? root

  return (
    <aside
      style={{ width: size.width }}
      className="relative flex shrink-0 flex-col border-l border-[var(--p-line)] bg-[var(--p-surface)]"
    >
      <ResizeHandle
        side="left"
        dragging={size.dragging}
        onMouseDown={size.onMouseDown}
        onReset={size.reset}
      />

      <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 border-b border-[var(--p-line)] px-4">
        <FolderTree size={16} strokeWidth={1.75} className="text-primarySoft" />
        <span className="flex-1 truncate text-sm font-semibold" title={root}>
          {shortRoot}
        </span>
        <button
          onClick={() => void reload()}
          className="no-drag text-dim transition-colors hover:text-muted"
          title={t('common.refresh')}
        >
          <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={onClose} className="no-drag text-dim transition-colors hover:text-fg">
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

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

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {error && (
          <div className="mx-1.5 my-2 rounded-lg border border-err/25 bg-err/[0.07] p-2.5 text-xs text-err">
            {error}
          </div>
        )}
        {!error && visible.length === 0 && !loading && (
          <div className="px-3 py-8 text-center text-sm text-dim">{t('files.nothing')}</div>
        )}
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

      <div className="border-t border-[var(--p-line)] px-4 py-2 text-micro leading-snug text-dim">
        {t('files.hint')}
      </div>
    </aside>
  )
}
