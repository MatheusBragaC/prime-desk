import type { RefObject } from 'react'
import { ArrowDown } from '@/icons'
import { Message } from './Message'
import { Welcome } from './Welcome'
import { PendingBubble } from './PendingBubble'
import type { ToolExec, UiMessage } from '@/store/agent'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'

/**
 * O palco da conversa: falha fatal, carregamento, tela inicial ou mensagens.
 *
 * Os quatro estados são exclusivos e ficam juntos porque a escolha entre eles é
 * uma só decisão. O rolador vem de fora (`scrollRef`) porque quem manda na
 * rolagem é o `useStickyScroll`, que precisa do elemento antes da pintura.
 */

export interface TranscriptProps {
  fatal: string | null
  loadingSession: boolean
  /** Conversa sem conteúdo: o composer sobe para o centro, e o palco encolhe. */
  isEmpty: boolean
  messages: readonly UiMessage[]
  tools: Record<string, ToolExec>
  hidden: number
  onLoadOlder: () => void
  showPending: boolean
  scrollRef: RefObject<HTMLDivElement>
  onScroll: () => void
  /** Conversa colada no fim. Falso enquanto o usuário lê atrás. */
  atBottom: boolean
  onBackToEnd: () => void
}

export function Transcript({
  fatal,
  loadingSession,
  isEmpty,
  messages,
  tools,
  hidden,
  onLoadOlder,
  showPending,
  scrollRef,
  onScroll,
  atBottom,
  onBackToEnd
}: TranscriptProps) {
  const { t } = useT()

  /*
    Texto do último turno JÁ FECHADO, para a região de status.

    Só entra quando `streaming` é falso: é isso que garante uma leitura só, com
    a resposta inteira, em vez de uma releitura por quadro.
  */
  const ultimoFechado = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && !m.streaming)
  const anuncio = ultimoFechado
    ? ultimoFechado.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim()
    : ''

  if (fatal) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        {/* `alert` e nao `status`: a ponte caiu e nada mais vai chegar. */}
        <div role="alert" className="max-w-[560px] rounded-xl border border-err/30 bg-err/[0.07] p-5">
          <div className="text-base font-semibold text-err">{t('bridge.fatalTitle')}</div>
          <pre className="mt-2.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-sm text-muted">
            {fatal}
          </pre>
          <div className="mt-3 text-sm text-dim">{t('bridge.fatalHint')}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="log"
      aria-label={t('chat.log')}
      /*
        `role="log"` dá navegação e contexto, mas SEM `aria-live` aqui.

        A resposta chega token a token no mesmo nó de texto: com região viva na
        lista, o leitor de tela releria a mensagem inteira a cada quadro — pior
        que o silêncio de hoje. O anúncio sai da região de status abaixo, uma
        vez, com o turno já fechado.
      */
      aria-live="off"
      className={'relative z-10 overflow-y-auto ' + (isEmpty ? 'shrink-0' : 'min-h-0 flex-1')}
    >
      {loadingSession ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-dim">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t('chat.opening')}
        </div>
      ) : messages.length === 0 ? (
        <Welcome />
      ) : (
        <div className="mx-auto max-w-col pb-2 pt-1">
          {hidden > 0 && (
            <div className="mb-2 flex flex-col items-center gap-1 px-6">
              <button
                onClick={onLoadOlder}
                className="rounded-field px-3 py-1.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                {t('chat.loadOlder')}
              </button>
              <span className="text-micro text-dim">{t('chat.hiddenCount', { n: hidden })}</span>
            </div>
          )}
          {messages.map((m, i) => (
            <Message
              key={m.key}
              msg={m}
              tools={tools}
              continuation={i > 0 && messages[i - 1].role === m.role}
            />
          ))}
          {showPending && <PendingBubble />}
          <div className="h-6" />
        </div>
      )}

      {/*
        Uma leitura por turno, com a resposta completa.

        Fica fora do `role="log"` de propósito: dentro dele herdaria o
        `aria-live="off"` e não anunciaria nada.
      */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {anuncio}
      </span>

      {/*
        A adesão solta com 90px de folga e não havia nada que devolvesse o fim —
        quem subia para reler ficava sem caminho de volta, e o texto novo
        continuava chegando fora da vista.
      */}
      {!atBottom && !isEmpty && messages.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={onBackToEnd}
          icon={<ArrowDown size={13} />}
          className="sticky bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-field bg-[var(--p-panel)] shadow-2xl shadow-drop"
        >
          {t('chat.backToEnd')}
        </Button>
      )}
    </div>
  )
}
