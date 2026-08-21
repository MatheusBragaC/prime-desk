import { useMemo, useState } from 'react'
import { Plus, Search, FolderOpen, MessageSquare, RefreshCw } from 'lucide-react'
import { useAgent, newSession, refreshSessions, rpc } from '../store/agent'
import { Butterfly } from './Butterfly'
import { relTime, shortPath } from '../lib/format'

export function Sidebar({ home, onPickCwd }: { home: string; onPickCwd: () => void }) {
  const sessions = useAgent((s) => s.sessions)
  const state = useAgent((s) => s.state)
  const cwd = useAgent((s) => s.cwd)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
    )
  }, [sessions, query])

  async function open(id: string) {
    setBusy(true)
    await rpc('switch_session', { sessionId: id })
    useAgent.getState().reset()
    const data = await rpc<{ messages: unknown[] }>('get_messages')
    if (data?.messages) {
      for (const m of data.messages) {
        useAgent.getState().ingest({ type: 'message_end', message: m } as never)
      }
    }
    setBusy(false)
  }

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-white/[0.06] bg-[var(--p-surface)]">
      <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-2 px-4">
        <Butterfly size={19} />
        <span className="text-[13.5px] font-semibold tracking-tight">Prime Desk</span>
      </div>

      <div className="px-3 pb-2.5">
        <button
          onClick={() => void newSession()}
          className="no-drag flex w-full items-center gap-2 rounded-[10px] border border-primary/25 bg-primary/[0.11] px-3 py-2 text-[13px] font-medium text-fg transition-colors hover:border-primary/45 hover:bg-primary/[0.18]"
        >
          <Plus size={15} className="text-primarySoft" />
          Nova conversa
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-[9px] border border-white/[0.07] bg-black/25 px-2.5 py-1.5 focus-within:border-primary/40">
          <Search size={13} className="shrink-0 text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sessões"
            className="w-full bg-transparent text-[12.5px] text-fg outline-none placeholder:text-dim"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pb-1 pt-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-dim">
          Sessões · {filtered.length}
        </span>
        <button
          onClick={() => void refreshSessions()}
          className="text-dim transition-colors hover:text-muted"
          title="Recarregar"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-[12.5px] text-dim">Nenhuma sessão.</div>
        )}
        {filtered.map((s) => {
          const active = state?.sessionId === s.id
          return (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => void open(s.id)}
              className={
                'mb-0.5 block w-full rounded-[9px] px-2.5 py-2 text-left transition-colors disabled:opacity-50 ' +
                (active ? 'bg-[var(--p-selected)]' : 'hover:bg-white/[0.04]')
              }
            >
              <div className="flex items-start gap-2">
                <MessageSquare
                  size={12.5}
                  className={'mt-[3px] shrink-0 ' + (active ? 'text-primarySoft' : 'text-dim')}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.8px] leading-snug text-fg">{s.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-dim">
                    <span>{relTime(s.updatedAt)}</span>
                    {s.messageCount > 0 && <span>· {s.messageCount} msgs</span>}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <button
        onClick={onPickCwd}
        className="flex items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        title="Trocar diretório de trabalho (reinicia o agente)"
      >
        <FolderOpen size={13} className="shrink-0 text-dim" />
        <span className="truncate font-mono text-[11.5px] text-muted">
          {shortPath(cwd, home) || 'selecionar diretório'}
        </span>
      </button>
    </aside>
  )
}
