import { useState } from 'react'
import { FileDiff, RefreshCw, ChevronRight } from 'lucide-react'
import { useAsync } from '../lib/useAsync'
import { unwrap } from '../lib/ipc'
import { DockPanel } from './DockPanel'
import { PanelEmpty, PanelError, PanelLoading } from './PanelState'
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
  const [open, setOpen] = useState<string | null>(null)

  const list = useAsync<GitChange[]>(
    () => unwrap(window.prime.gitChanges(), (r) => r.changes as GitChange[], t('diff.noRepo')),
    [],
    { keepPrevious: true }
  )

  /*
    O diff de um arquivo é carga própria, com `open` na dependência. Antes era
    um `async` solto no clique: clicar rápido em dois arquivos podia deixar a
    resposta do primeiro pintar sobre o segundo. Aqui a época do hook descarta a
    resposta que chega atrasada.
  */
  const detail = useAsync<{ diff: string; truncated: boolean } | null>(
    async () => {
      if (!open) return null
      return unwrap(
        window.prime.gitDiff(open),
        (r) => ({ diff: r.diff as string, truncated: Boolean(r.truncated) }),
        t('diff.empty')
      )
    },
    [open]
  )

  const changes = list.data ?? []
  const totalAdded = changes.reduce((n, c) => n + c.added, 0)
  const totalRemoved = changes.reduce((n, c) => n + c.removed, 0)

  // `not-a-repo` é sentinela do main, não frase para o usuário.
  const listError =
    list.error === 'not-a-repo' ? t('diff.noRepo') : list.error

  return (
    <DockPanel
      storageKey="diff"
      defaultWidth={420}
      min={300}
      max={900}
      headerBorder={false}
      icon={<FileDiff size={16} strokeWidth={1.75} className="text-primarySoft" />}
      title={t('diff.title')}
      onClose={onClose}
      bodyClassName="min-h-0 flex-1 overflow-y-auto pb-2"
      actions={
        <button
          onClick={() => void list.reload()}
          className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-muted"
          title={t('common.refresh')}
        >
          <RefreshCw
            size={16} strokeWidth={1.75}
            className={list.loading || list.refreshing ? 'animate-spin' : ''}
          />
        </button>
      }
    >
      {changes.length > 0 && (
        <div className="flex items-center gap-3 px-4 pb-2 font-mono text-xs">
          <span className="text-dim">{t('diff.count', { n: changes.length })}</span>
          <span className="text-[var(--p-diff-added)]">+{totalAdded}</span>
          <span className="text-[var(--p-diff-removed)]">−{totalRemoved}</span>
        </div>
      )}

      {listError && <PanelError message={listError} />}
      {list.loading && <PanelLoading />}
      {!listError && !list.loading && changes.length === 0 && (
        <PanelEmpty message={t('diff.clean')} />
      )}

      {changes.map((c) => {
        const m = mark(c.status)
        const isOpen = open === c.path
        return (
          <div key={c.path}>
            <button
              onClick={() => setOpen(isOpen ? null : c.path)}
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
                {detail.loading && <PanelLoading />}
                {detail.error && <PanelError message={detail.error} />}
                {detail.data?.diff ? (
                  <DiffBody diff={detail.data.diff} />
                ) : (
                  !detail.loading &&
                  !detail.error && (
                    <div className="px-4 py-3 text-sm italic text-dim">{t('diff.empty')}</div>
                  )
                )}
                {detail.data?.truncated && (
                  <div className="px-4 pb-3 text-xs text-warn">{t('diff.truncated')}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </DockPanel>
  )
}
