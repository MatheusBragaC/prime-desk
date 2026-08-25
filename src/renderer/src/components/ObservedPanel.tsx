import { useEffect, useRef } from 'react'
import { X, Radio, AlertTriangle, CircleOff, Loader2 } from 'lucide-react'
import { useAgent, unobserveSession } from '../store/agent'
import { Message } from './Message'
import { fmtTokens } from '../lib/format'
import { useT } from '../i18n'

/**
 * Transcript ao vivo de outra sessão (normalmente um subagente).
 *
 * Somente leitura: não há composer. Injetar prompt aqui exigiria `send_message`
 * e mudaria a semântica de "observar" para "interferir" — decisão consciente de
 * manter fora do escopo deste painel.
 */
export function ObservedPanel({ activeSessionId }: { activeSessionId: string }) {
  const { t } = useT()
  const obs = useAgent((s) => s.observed[activeSessionId])
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [obs?.transcript.messages, obs?.transcript.tools])

  if (!obs) return null

  const { transcript, status } = obs
  const live = status === 'live'
  const fresh = Date.now() - obs.lastEventAt < 4000

  return (
    // Fundo opaco: o transcript observado é um contexto próprio e não deve
    // deixar a conversa principal vazar por trás.
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--p-bg)]">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--p-line)] px-5">
        {status === 'loading' && <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-primary" />}
        {live && (
          <Radio
            size={16} strokeWidth={1.75}
            className={fresh ? 'animate-pulse-soft text-ok' : 'text-primarySoft'}
          />
        )}
        {status === 'closed' && <CircleOff size={16} strokeWidth={1.75} className="text-dim" />}
        {status === 'error' && <AlertTriangle size={16} strokeWidth={1.75} className="text-err" />}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {obs.name || activeSessionId}
          </div>
          <div className="font-mono text-micro text-dim">
            {activeSessionId} ·{' '}
            {status === 'loading'
              ? t('observed.connecting')
              : live
                ? t('observed.live')
                : status === 'closed'
                  ? t('observed.closed')
                  : t('app.error').toLowerCase()}
            {transcript.totals.tokens > 0 && ` · ${fmtTokens(transcript.totals.tokens)} tokens`}
          </div>
        </div>

        <button
          onClick={() => void unobserveSession(activeSessionId)}
          className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          {t('observed.stop')}
        </button>
        <button
          onClick={() => void unobserveSession(activeSessionId)}
          className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {obs.error && (
        <div className="mx-5 mt-4 rounded-xl border border-err/25 bg-err/[0.07] p-3.5 text-sm text-err">
          {obs.error}
        </div>
      )}

      {status === 'closed' && (
        <div className="mx-5 mt-4 rounded-xl border border-[var(--p-line)] bg-white/[0.02] p-3 text-sm text-muted">
          {t('observed.closedNote')}
        </div>
      )}

      <div ref={scroller} onScroll={() => {
        const el = scroller.current
        if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
      }} className="min-h-0 flex-1 overflow-y-auto">
        {transcript.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-dim">
            {status === 'loading' ? t('observed.loadingTranscript') : t('observed.empty')}
          </div>
        ) : (
          <div className="mx-auto max-w-[860px] py-4">
            {transcript.messages.map((m, i) => (
              <Message
                key={m.key}
                msg={m}
                tools={transcript.tools}
                continuation={i > 0 && transcript.messages[i - 1].role === m.role}
              />
            ))}
            <div className="h-4" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--p-line)] px-5 py-2.5 text-xs text-dim">
        {t('observed.readOnly')}
      </div>
    </div>
  )
}
