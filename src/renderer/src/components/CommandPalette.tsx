import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Sparkles, Zap } from 'lucide-react'
import { useAgent, sendPrompt, newSession, compactNow } from '../store/agent'
import { useT } from '../i18n'

interface Item {
  id: string
  label: string
  hint: string
  run: () => void | Promise<void>
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const commands = useAgent((s) => s.commands)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const builtin: Item[] = [
      { id: 'new', label: t('palette.newChat'), hint: t('palette.session'), run: () => newSession() },
      { id: 'compact', label: t('palette.compact'), hint: t('palette.context'), run: () => compactNow() }
    ]
    const skills: Item[] = commands.map((c) => ({
      id: c.name,
      label: '/' + c.name,
      hint: c.description.slice(0, 96),
      // `sendPrompt` devolve se foi aceito; aqui não há caixa para preservar.
      run: async () => {
        await sendPrompt('/' + c.name)
      }
    }))
    const all = [...builtin, ...skills]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, items.length - 1)))
  }, [items.length])

  if (!open) return null

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % Math.max(1, items.length))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + items.length) % Math.max(1, items.length))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[cursor]
      if (item) {
        void item.run()
        onClose()
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-start justify-center bg-black/55 pt-[16vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="w-[600px] max-w-[90vw] animate-fade-up overflow-hidden rounded-2xl border border-white/[0.1] bg-[var(--p-panel)] shadow-2xl shadow-black/70"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--p-line)] px-4 py-3">
          <Search size={16} strokeWidth={1.75} className="text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('palette.search')}
            className="w-full bg-transparent text-base text-fg outline-none placeholder:text-dim"
          />
        </div>

        <div className="max-h-[380px] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-dim">{t('palette.nothing')}</div>
          )}
          {items.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                void item.run()
                onClose()
              }}
              className={
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ' +
                (i === cursor ? 'bg-primary/[0.16]' : 'hover:bg-white/[0.04]')
              }
            >
              {item.id === 'new' || item.id === 'compact' ? (
                <Zap size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
              ) : (
                <Sparkles size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
              )}
              <span className="shrink-0 font-mono text-sm text-fg">{item.label}</span>
              <span className="truncate text-xs text-dim">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
