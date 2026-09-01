import { useCallback, useEffect, useState } from 'react'
import { FileDiff, RefreshCw, X, ChevronRight } from 'lucide-react'
import { useResizable } from '../lib/useResizable'
import { ResizeHandle } from './ResizeHandle'
import { useT } from '../i18n'

interface GitChange {
  path: string
  status: string
  added: number
  removed: number
}

/**
 * Letra de estado do `git status --porcelain`, traduzida para uma marca de uma
 * letra só. A segunda coluna (árvore de trabalho) manda: é o que o usuário vê
 * no disco agora.
 */
function mark(status: string): { letter: string; className: string; title: string } {
  const s = status.trim()
  if (s === '??') return { letter: 'N', className: 'text-ok', title: 'untracked' }
  if (s.includes('D')) return { letter: 'D', className: 'text-err', title: 'deleted' }
  if (s.includes('A')) return { letter: 'A', className: 'text-ok', title: 'added' }
  if (s.includes('R')) return { letter: 'R', className: 'text-info', title: 'renamed' }
  return { letter: 'M', className: 'text-warn', title: 'modified' }
}

/** Diff unificado colorido. Sem parser: a primeira coluna já diz tudo. */
function DiffBody({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <pre className="overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed">
      {lines.map((line, i) => {
        let cls = 'text-muted'
        if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-dim'
        else if (line.startsWith('@@')) cls = 'text-primarySoft'
        else if (line.startsWith('diff ') || line.startsWith('index ')) cls = 'text-dim'
        else if (line.startsWith('+')) cls = 'text-[var(--p-diff-added)]'
        else if (line.startsWith('-')) cls = 'text-[var(--p-diff-removed)]'
        return (
          <div key={i} className={cls + ' whitespace-pre-wrap'}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

/**
 * Painel de alterações do repositório.
 *
 * Lê `git status` e `git diff` do diretório onde o agente executa — é a forma
 * de ver o que o turno acabou de mexer sem sair do app. Somente leitura: não há
 * stage, commit ou descarte aqui.
 */
export function DiffPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const size = useResizable('diff', 420, 300, 900, 'left')
  const [changes, setChanges] = useState<GitChange[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const r = await window.prime.gitChanges()
    setLoading(false)
    if (!r?.ok) {
      setError(t('diff.noRepo'))
      setChanges([])
      return
    }
    setError(null)
    setChanges(r.changes as GitChange[])
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  async function toggle(path: string) {
    if (open === path) {
      setOpen(null)
      return
    }
    setOpen(path)
    setDiff('')
    const r = await window.prime.gitDiff(path)
    if (r?.ok) {
      setDiff(r.diff as string)
      setTruncated(Boolean(r.truncated))
    } else {
      setDiff('')
    }
  }

  const totalAdded = changes.reduce((n, c) => n + c.added, 0)
  const totalRemoved = changes.reduce((n, c) => n + c.removed, 0)

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

      <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 px-4">
        <FileDiff size={16} strokeWidth={1.75} className="text-primarySoft" />
        <span className="flex-1 truncate text-sm font-semibold">{t('diff.title')}</span>
        <button
          onClick={() => void reload()}
          className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-muted"
          title={t('common.refresh')}
        >
          <RefreshCw size={16} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onClose}
          className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {changes.length > 0 && (
        <div className="flex items-center gap-3 px-4 pb-2 font-mono text-xs">
          <span className="text-dim">{t('diff.count', { n: changes.length })}</span>
          <span className="text-[var(--p-diff-added)]">+{totalAdded}</span>
          <span className="text-[var(--p-diff-removed)]">−{totalRemoved}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {error && <div className="px-4 py-8 text-center text-sm text-dim">{error}</div>}

        {!error && changes.length === 0 && !loading && (
          <div className="px-4 py-8 text-center text-sm text-dim">{t('diff.clean')}</div>
        )}

        {changes.map((c) => {
          const m = mark(c.status)
          const isOpen = open === c.path
          return (
            <div key={c.path}>
              <button
                onClick={() => void toggle(c.path)}
                className={
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-elevated ' +
                  (isOpen ? 'bg-elevated' : '')
                }
                title={c.path}
              >
                <ChevronRight
                  size={16}
                  strokeWidth={1.75}
                  className={'shrink-0 text-dim transition-transform ' + (isOpen ? 'rotate-90' : '')}
                />
                <span className={'w-3 shrink-0 font-mono text-xs ' + m.className} title={m.title}>
                  {m.letter}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted">
                  {c.path}
                </span>
                {c.added > 0 && (
                  <span className="shrink-0 font-mono text-xs text-[var(--p-diff-added)]">
                    +{c.added}
                  </span>
                )}
                {c.removed > 0 && (
                  <span className="shrink-0 font-mono text-xs text-[var(--p-diff-removed)]">
                    −{c.removed}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="animate-fade-up border-y border-[var(--p-line)] bg-[var(--p-bg)]">
                  {diff ? <DiffBody diff={diff} /> : (
                    <div className="px-4 py-3 text-sm italic text-dim">{t('diff.empty')}</div>
                  )}
                  {truncated && (
                    <div className="px-4 pb-3 text-xs text-warn">{t('diff.truncated')}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
