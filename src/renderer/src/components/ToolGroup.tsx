import { useState } from 'react'
import { IconDone, IconFailed, ChevronRight, IconCommand, Loader2 } from '@/icons'
import type { ToolExec } from '@/store/agent'
import { ToolCard } from './ToolCard'
import { fmtDuration } from '@/lib/format'
import { useT } from '@/i18n'
import { Button } from '@/components/ui/Button'

/**
 * Uma corrida de chamadas seguidas, como uma linha só.
 *
 * Seis chamadas de ferramenta eram seis cartões empilhados, e o texto do outro
 * lado sumia da tela — em turno agêntico isso é a regra, não a exceção: das 437
 * chamadas medidas num recorte real do disco, a grande maioria vem em rajada.
 * Agrupadas, a resposta volta a caber junto do raciocínio que a produziu.
 *
 * Chamada solta continua sendo um cartão: agrupar uma só acrescentaria um
 * clique sem acrescentar informação.
 */
export function ToolGroup({
  execs,
  live
}: {
  /** Cada item é a execução de um bloco `toolCall`; `undefined` é chamada sem resposta. */
  execs: { id: string; name?: string; exec?: ToolExec }[]
  live: boolean
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  const rodando = execs.some((e) => e.exec?.status === 'running')
  const falhou = execs.some((e) => e.exec?.status === 'error')
  /*
    Duração só quando TODAS reportaram. Somar as que têm e ignorar as que não
    têm daria um total menor que o real, apresentado com a mesma confiança.
  */
  const duracoes = execs.map((e) => e.exec?.durationMs)
  const total = duracoes.every((d) => d !== undefined)
    ? duracoes.reduce((a, d) => a + (d ?? 0), 0)
    : undefined

  return (
    <div className="my-2 overflow-hidden rounded-card border border-[var(--p-line)] bg-[var(--p-surface)]">
      <Button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-left font-normal hover:bg-elevated"
      >
        <ChevronRight
          size={14}
          className={'shrink-0 text-dim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <IconCommand size={14} className="shrink-0 text-dim" />
        <span className="flex-1 truncate text-sm text-muted">
          {t('tool.steps', { n: execs.length })}
        </span>
        {total !== undefined && (
          <span className="shrink-0 font-mono text-xs text-dim">{fmtDuration(total)}</span>
        )}
        {rodando ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
        ) : falhou ? (
          <IconFailed className="shrink-0 text-err" />
        ) : (
          <IconDone className="shrink-0 text-ok" />
        )}
      </Button>

      {open && (
        <div className="animate-fade-up border-t border-[var(--p-line)] px-2 pb-1">
          {execs.map((e) => (
            <ToolCard key={e.id} exec={e.exec} pendingName={e.name} live={live} />
          ))}
        </div>
      )}
    </div>
  )
}
