import { memo } from 'react'
import type { ContentBlock } from '../../../shared/protocol'
import type { UiMessage, ToolExec } from '../store/agent'
import { Markdown } from './Markdown'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'
import { fmtTokens } from '../lib/format'
import { useSmoothText } from '../lib/useSmoothText'
import { balanceMarkdown } from '../lib/markdownStream'
import { splitStream } from '../lib/splitStream'

/**
 * Bloco de texto do assistente, com revelação suave enquanto transmite.
 *
 * Ao vivo o texto é partido em prefixo estável e cauda: só a cauda é reparseada
 * a cada quadro. Sem isso, um parse da mensagem inteira (26,7 ms aos 15 mil
 * caracteres) estourava sozinho o orçamento de 16,7 ms do quadro, e a resposta
 * ia ficando mais pesada quanto mais longa.
 */
function StreamingText({ text, live }: { text: string; live: boolean }) {
  const shown = useSmoothText(text, live)
  const catchingUp = live && shown.length < text.length

  if (!live && !catchingUp) {
    return (
      <div className="mb-1">
        <Markdown text={shown} />
      </div>
    )
  }

  const { stable, tail } = splitStream(shown)
  return (
    <div className="mb-1">
      {stable && <Markdown text={stable} highlight={false} />}
      <Markdown text={balanceMarkdown(tail)} highlight={false} />
      <Caret />
    </div>
  )
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-[1.05em] w-[1.5px] translate-y-[2px] animate-pulse-soft bg-primary align-middle" />
  )
}

export const Message = memo(function Message({
  msg,
  tools,
  continuation = false
}: {
  msg: UiMessage
  tools: Record<string, ToolExec>
  /** Segue outra mensagem do mesmo autor: dispensa o respiro entre turnos. */
  continuation?: boolean
}) {
  if (msg.role === 'user') {
    const text = msg.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    const images = msg.content.filter(
      (b): b is Extract<ContentBlock, { type: 'image' }> => b.type === 'image'
    )

    return (
      <div
        className={
          'animate-fade-up flex justify-end px-6 ' +
          (continuation ? 'pt-1.5' : 'pt-[var(--turn-gap)]')
        }
      >
        {/* Sem borda: a bolha se separa do palco pelo tom, como no Claude Desktop. */}
        <div className="max-w-[82%] rounded-field rounded-br-[6px] bg-[var(--p-user-bg)] px-4 py-2.5">
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt=""
                  className="max-h-44 rounded-card border border-white/10"
                />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap text-base">{text}</div>
        </div>
      </div>
    )
  }

  const lastIdx = msg.content.length - 1

  /*
    Blocos vazios existem no começo do turno: o `thinking` chega antes de ter
    texto e o `ThinkingBlock` não desenha nada. Sem esta saída, a mensagem
    ocuparia um turno inteiro de respiro sem nada dentro, logo acima da bolha de
    atividade — dois espaços em branco seguidos.
  */
  const hasVisibleContent = msg.content.some(
    (b) =>
      (b.type === 'text' && b.text.trim().length > 0) ||
      (b.type === 'thinking' && b.thinking.trim().length > 0) ||
      b.type === 'toolCall'
  )
  if (!hasVisibleContent) return null

  return (
    <div
      className={
        'animate-fade-up group px-6 ' + (continuation ? 'pt-1' : 'pt-[var(--turn-gap)]')
      }
    >
      {/*
        Sem avatar. O Claude Desktop trata a resposta como texto sobre a tela, não
        como mensagem de chat com remetente — o interlocutor é evidente pela
        alternância. A marca Prime aparece onde tem função: sidebar, tela inicial
        e o cursor de streaming.
      */}
      <div className="flex">
        <div className="min-w-0 flex-1">
          {msg.content.map((block, i) => {
            if (block.type === 'thinking') {
              return (
                <ThinkingBlock
                  key={i}
                  text={block.thinking}
                  streaming={msg.streaming && i === lastIdx}
                />
              )
            }
            if (block.type === 'text') {
              const live = msg.streaming && i === lastIdx
              return <StreamingText key={i} text={block.text} live={live} />
            }
            if (block.type === 'toolCall') {
              return (
                <ToolCard
                  key={block.id || i}
                  exec={tools[block.id]}
                  pendingName={block.name}
                  live={msg.streaming}
                />
              )
            }
            return null
          })}

          {msg.usage && !msg.streaming && msg.usage.totalTokens > 0 && (
            <div className="mt-1.5 font-mono text-xs text-dim opacity-0 transition-opacity group-hover:opacity-100">
              {fmtTokens(msg.usage.totalTokens)} tokens
              {msg.usage.cost?.total ? ` · $${msg.usage.cost.total.toFixed(4)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
