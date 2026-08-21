import { memo } from 'react'
import type { ContentBlock } from '../../../shared/protocol'
import type { UiMessage, ToolExec } from '../store/agent'
import { Markdown } from './Markdown'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'
import { Butterfly } from './Butterfly'
import { fmtTokens } from '../lib/format'

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse-soft bg-primary align-middle" />
  )
}

export const Message = memo(function Message({
  msg,
  tools
}: {
  msg: UiMessage
  tools: Record<string, ToolExec>
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
      <div className="animate-fade-up flex justify-end px-6 py-3">
        <div className="max-w-[76%] rounded-[var(--p-radius)] rounded-br-[5px] border border-white/[0.07] bg-[var(--p-user-bg)] px-4 py-2.5">
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt=""
                  className="max-h-44 rounded-lg border border-white/10"
                />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{text}</div>
        </div>
      </div>
    )
  }

  const lastIdx = msg.content.length - 1

  return (
    <div className="animate-fade-up group px-6 py-3">
      <div className="flex gap-3.5">
        <div className="mt-0.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-surface">
            <Butterfly size={17} className={msg.streaming ? 'animate-pulse-soft' : ''} />
          </div>
        </div>

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
              return (
                <div key={i} className="mb-1">
                  <Markdown text={block.text} />
                  {live && <Caret />}
                </div>
              )
            }
            if (block.type === 'toolCall') {
              return <ToolCard key={block.id || i} exec={tools[block.id]} pendingName={block.name} />
            }
            return null
          })}

          {msg.usage && !msg.streaming && msg.usage.totalTokens > 0 && (
            <div className="mt-1.5 font-mono text-[11px] text-dim opacity-0 transition-opacity group-hover:opacity-100">
              {fmtTokens(msg.usage.totalTokens)} tokens
              {msg.usage.cost?.total ? ` · $${msg.usage.cost.total.toFixed(4)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
