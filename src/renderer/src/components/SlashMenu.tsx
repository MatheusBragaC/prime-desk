import { useEffect, useRef } from 'react'
import { Sparkles, FileText, Puzzle } from 'lucide-react'
import type { CommandInfo } from '../store/agent'
import { useT } from '../i18n'

function SourceIcon({ source }: { source: string }) {
  if (source === 'skill') return <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
  if (source === 'template') return <FileText size={14} strokeWidth={1.75} className="shrink-0 text-info" />
  return <Puzzle size={14} strokeWidth={1.75} className="shrink-0 text-warn" />
}

/**
 * Sugestão de comandos ao digitar `/` no composer.
 *
 * A lista vem de `get_commands`, ou seja, é exatamente o que o agente sabe
 * expandir: skills, templates e comandos de extensão. Não inventamos entradas —
 * um item aqui sempre corresponde a algo que o prime-agent executa.
 */
export function SlashMenu({
  items,
  cursor,
  onPick,
  onHover
}: {
  items: CommandInfo[]
  cursor: number
  onPick: (item: CommandInfo) => void
  onHover: (index: number) => void
}) {
  const { t } = useT()
  const listRef = useRef<HTMLDivElement>(null)

  // Mantém o item selecionado visível quando navega pelo teclado.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (items.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 animate-fade-up overflow-hidden rounded-xl border border-white/[0.1] bg-[var(--p-panel)] shadow-2xl shadow-black/70">
      <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1">
        {items.map((item, i) => (
          <button
            key={item.name}
            data-idx={i}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => {
              // mousedown, não click: o blur do textarea fecharia o menu antes.
              e.preventDefault()
              onPick(item)
            }}
            className={
              'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ' +
              (i === cursor ? 'bg-primary/[0.16]' : 'hover:bg-white/[0.04]')
            }
          >
            <span className="mt-[3px]">
              <SourceIcon source={item.source} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm text-fg">/{item.name}</span>
              {/* line-clamp define o display; adicionar `block` aqui o anularia. */}
              <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-dim">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--p-line)] px-3 py-1.5 text-micro text-dim">
        <span><kbd className="font-mono">↑↓</kbd> {t('slash.navigate')}</span>
        <span><kbd className="font-mono">Tab</kbd> / <kbd className="font-mono">Enter</kbd> {t('slash.insert')}</span>
        <span><kbd className="font-mono">Esc</kbd> {t('slash.dismiss')}</span>
        <span className="ml-auto">{t('slash.count', { n: items.length })}</span>
      </div>
    </div>
  )
}
