import { useEffect, useRef, useState } from 'react'
import { X, Radio, AlertTriangle, CircleOff, Loader2 } from 'lucide-react'
import { useAgent, unobserveSession, type Observed } from '@/store/agent'
import { Message } from './Message'
import { fmtTokens } from '@/lib/format'
import { useT } from '@/i18n'

/**
 * Transcript ao vivo de outras sessões (normalmente subagentes).
 *
 * Somente leitura: não há composer. Injetar prompt aqui exigiria `send_message`
 * e mudaria a semântica de "observar" para "interferir" — decisão consciente de
 * manter fora do escopo deste painel.
 *
 * O painel guarda várias sessões em abas porque o store sempre suportou N
 * observadas ao mesmo tempo: antes só a última era renderizada, e as demais
 * seguiam recebendo eventos sem nenhuma superfície — trabalho acontecendo
 * invisível, que é o oposto do que um painel de observação serve.
 */

/** Ícone de estado, compartilhado entre a aba e o cabeçalho. */
function StatusIcon({ obs, size }: { obs: Observed; size: number }) {
  const fresh = Date.now() - obs.lastEventAt < 4000
  if (obs.status === 'loading') {
    return <Loader2 size={size} strokeWidth={1.75} className="shrink-0 animate-spin text-primary" />
  }
  if (obs.status === 'live') {
    return (
      <Radio
        size={size} strokeWidth={1.75}
        className={'shrink-0 ' + (fresh ? 'animate-pulse-soft text-ok' : 'text-primarySoft')}
      />
    )
  }
  if (obs.status === 'closed') {
    return <CircleOff size={size} strokeWidth={1.75} className="shrink-0 text-dim" />
  }
  return <AlertTriangle size={size} strokeWidth={1.75} className="shrink-0 text-err" />
}

export function ObservedPanel() {
  const { t } = useT()
  const observed = useAgent((s) => s.observed)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [active, setActive] = useState('')

  const ids = Object.keys(observed)
  const key = ids.join('\0')

  /*
    Observar uma sessão nova foca ela. Sem isso, clicar no olho de um subagente
    com outro já aberto não mudaria nada na tela, e pareceria que o clique não
    funcionou.
  */
  const seen = useRef<string[]>([])
  useEffect(() => {
    const added = ids.filter((id) => !seen.current.includes(id))
    if (added.length > 0) setActive(added[added.length - 1])
    seen.current = ids
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aba fechada cai para a última restante, em vez de sumir com o painel.
  const activeSessionId = ids.includes(active) ? active : (ids[ids.length - 1] ?? '')
  const obs = observed[activeSessionId]

  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [obs?.transcript.messages, obs?.transcript.tools])

  // Trocar de aba começa colado no fim: é feed ao vivo, o interessante é o agora.
  useEffect(() => {
    pinned.current = true
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeSessionId])

  if (!obs) return null

  const { transcript, status } = obs
  const live = status === 'live'

  return (
    // Fundo opaco: o transcript observado é um contexto próprio e não deve
    // deixar a conversa principal vazar por trás.
    <div className="absolute inset-0 z-panel flex flex-col bg-[var(--p-bg)]">
      {/* A tira só aparece com mais de uma sessão: com uma só, seria ruído. */}
      {ids.length > 1 && (
        <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--p-line)] px-2 py-1.5">
          {ids.map((id) => {
            const o = observed[id]
            return (
              /*
                Aba e fechar são irmãos, não aninhados: `<button>` dentro de
                `<button>` é HTML inválido e o leitor de tela anuncia um
                controle ambíguo. A casca continua sendo a mesma pílula, agora
                num `div` que só posiciona.
              */
              <div
                key={id}
                className={
                  'group flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md pl-2 pr-1 text-xs transition-colors ' +
                  (id === activeSessionId
                    ? 'bg-elevated text-fg'
                    : 'text-dim hover:bg-elevated/60 hover:text-muted')
                }
              >
                <button
                  onClick={() => setActive(id)}
                  title={o.name || id}
                  className="flex min-w-0 items-center gap-1.5 text-left"
                >
                  <StatusIcon obs={o} size={12} />
                  <span className="max-w-[140px] truncate">{o.name || id.slice(0, 8)}</span>
                </button>
                {/* `focus-visible` porque o fechar só aparece no hover: sem isso, quem navega por teclado foca um botão invisível. */}
                <button
                  onClick={() => void unobserveSession(id)}
                  aria-label={t('observed.stop')}
                  className="rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--p-line)] px-5">
        <StatusIcon obs={obs} size={16} />

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
          aria-label={t('observed.stop')}
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
