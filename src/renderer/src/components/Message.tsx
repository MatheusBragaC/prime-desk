import { memo } from 'react'
import type { ContentBlock } from '@shared/protocol'
import type { UiMessage, ToolExec } from '@/store/agent'
import { Markdown } from './Markdown'
import { DocumentCard } from './DocumentCard'
import { detectDocument } from '@/lib/documentDetect'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCard } from './ToolCard'
import { ToolGroup } from './ToolGroup'
import { fmtCost, fmtTokens } from '@/lib/format'
import { useSmoothText } from '@/lib/useSmoothText'
import { balanceMarkdown } from '@/lib/markdownStream'
import { splitStream } from '@/lib/splitStream'
import { splitTrailingPaths, baseName } from '@/lib/attachments'
import { FileText } from 'lucide-react'

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
    const { body, paths } = splitTrailingPaths(text)
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
                  className="max-h-44 rounded-card border border-lineStrong"
                />
              ))}
            </div>
          )}
          {/*
            Os caminhos que o composer acrescentou no fim voltam a ser anexos na
            leitura. A mensagem enviada continua tendo o caminho — é assim que o
            agente acha o arquivo —, só não é ele que aparece.
          */}
          {paths.length > 0 && (
            <div className={'flex flex-wrap gap-1.5 ' + (body ? 'mb-2' : '')}>
              {paths.map((p, i) => (
                <span
                  key={i}
                  title={p}
                  className="flex max-w-[240px] items-center gap-1.5 rounded-md bg-chip px-2 py-1"
                >
                  <FileText size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
                  <span className="truncate text-sm text-muted">{baseName(p)}</span>
                </span>
              ))}
            </div>
          )}
          {body && <div className="whitespace-pre-wrap text-base">{body}</div>}
        </div>
      </div>
    )
  }

  const lastIdx = msg.content.length - 1

  /*
    Junta chamadas SEGUIDAS num só item de renderização.

    A corrida é o caso comum em turno agêntico, e empilhar um cartão por chamada
    empurrava o texto da resposta para fora da tela. O agrupamento é estrutural:
    não interpreta o que a ferramenta fez, só reconhece que veio em rajada.
  */
  const itens: ({ tipo: 'bloco'; bloco: ContentBlock; i: number }
    | { tipo: 'grupo'; chamadas: { id: string; name?: string }[]; i: number })[] = []
  for (let i = 0; i < msg.content.length; i++) {
    const b = msg.content[i]
    if (b.type !== 'toolCall') {
      itens.push({ tipo: 'bloco', bloco: b, i })
      continue
    }
    const anterior = itens[itens.length - 1]
    if (anterior?.tipo === 'grupo') {
      anterior.chamadas.push({ id: b.id, name: b.name })
    } else {
      itens.push({ tipo: 'grupo', chamadas: [{ id: b.id, name: b.name }], i })
    }
  }

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
          {itens.map((item) => {
            if (item.tipo === 'grupo') {
              const chamadas = item.chamadas.map((c) => ({
                id: c.id || String(item.i),
                name: c.name,
                exec: tools[c.id]
              }))
              // Chamada solta continua cartão: agrupar uma só seria um clique a mais
              // sem informação a mais.
              if (chamadas.length === 1) {
                return (
                  <ToolCard
                    key={chamadas[0].id}
                    exec={chamadas[0].exec}
                    pendingName={chamadas[0].name}
                    live={msg.streaming}
                  />
                )
              }
              return <ToolGroup key={`g${item.i}`} execs={chamadas} live={msg.streaming} />
            }

            const block = item.bloco
            const i = item.i
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
              /*
                Detecção só corre em mensagem finalizada ou no bloco vivo do
                streaming — não nos blocos de trás, que já pintaram e não vão
                mudar de opinião sobre serem documento ou não.
              */
              const detected = !msg.streaming || live ? detectDocument(block.text) : null
              if (detected) {
                return (
                  <DocumentCard
                    key={i}
                    id={`${msg.key}:${i}`}
                    text={block.text}
                    detected={detected}
                    streaming={live}
                  />
                )
              }
              return <StreamingText key={i} text={block.text} live={live} />
            }
            return null
          })}

          {/*
            Visível ao fim do turno, não só sob o ponteiro. Nascia em
            `opacity-0`: o número existia no DOM e não chegava a quem navega por
            teclado nem a quem usa leitor de tela.
          */}
          {msg.usage && !msg.streaming && msg.usage.totalTokens > 0 && (
            <div className="mt-1.5 font-mono text-xs text-dim">
              {fmtTokens(msg.usage.totalTokens)} tokens
              {/* `fmtCost`, not a local toFixed: four decimals here against two
                  everywhere else made the same spend read as two numbers. */}
              {msg.usage.cost?.total ? ` · ${fmtCost(msg.usage.cost.total)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
