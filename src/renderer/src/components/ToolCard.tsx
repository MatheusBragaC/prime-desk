import { useState } from 'react'
import { IconDone, IconFailed, ChevronRight, IconCommand, Loader2, RotateCcw, CircleSlash } from '@/icons'
import type { ToolExec } from '@/store/agent'
import { fmtDuration, fmtElapsed } from '@/lib/format'
import { summary, codeFrom } from '@/lib/toolSummary'
import { useTurnClock, WARN_AFTER_MS } from '@/lib/useTurnActivity'
import { useT } from '@/i18n'

const MAX_PREVIEW = 4000

export function ToolCard({
  exec,
  pendingName,
  live = false
}: {
  exec?: ToolExec
  pendingName?: string
  /** A mensagem ainda está sendo transmitida: a chamada pode estar a caminho. */
  live?: boolean
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  /*
    Relógio compartilhado, e ligado só enquanto ESTA chamada roda: card de
    chamada terminada não se inscreve e não re-renderiza. Fica antes de
    qualquer retorno antecipado porque hook não pode ser condicional.
  */
  const now = useTurnClock(exec?.status === 'running' && exec.startedAt !== undefined)

  if (!exec) {
    /*
      Sem entrada de execução há dois casos bem diferentes, e tratá-los igual
      deixava um spinner girando para sempre: a chamada pode estar a caminho
      (mensagem ainda transmitindo) ou pode nunca ter tido resposta, quando o
      turno foi interrompido entre a chamada e a execução — situação que fica
      registrada assim no arquivo da sessão.
    */
    if (live) {
      return (
        <div className="my-2 flex items-center gap-2 rounded-card border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-sm text-dim">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span>{t('tool.preparing', { name: pendingName ?? 'tool' })}</span>
        </div>
      )
    }

    return (
      <div
        title={t('tool.noResultHint')}
        className="my-2 flex items-center gap-2 rounded-card border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-sm text-warn"
      >
        <CircleSlash size={14} className="shrink-0" />
        <span className="font-mono text-sm opacity-80">{pendingName ?? 'tool'}</span>
        <span className="opacity-90">· {t('tool.noResult')}</span>
      </div>
    )
  }

  const running = exec.status === 'running'
  const failed = exec.status === 'error'
  const code = codeFrom(exec.args)

  /*
    Onde a causa costuma estar: `stderr` quando existe, senão a ÚLTIMA linha
    útil da saída — traceback de Python termina na exceção, e é ela que importa,
    não a primeira linha do rastro.
  */
  const motivo = (() => {
    const fonte = exec.stderr?.trim() || exec.text?.trim() || ''
    if (!fonte) return ''
    const linhas = fonte.split('\n').map((l) => l.trim()).filter(Boolean)
    return (linhas[linhas.length - 1] ?? '').slice(0, 160)
  })()

  /*
    Relógio ao vivo enquanto roda. Antes o card mostrava o mesmo spinner para
    uma chamada de dois segundos e para uma de quarenta minutos: a única
    diferença perceptível era a paciência de quem olhava.

    `startedAt` só existe em chamada vista ao vivo — conversa carregada do disco
    não tem evento de início, e ali o spinner some sozinho ao chegar o
    resultado, então não há relógio a mostrar.
  */
  const elapsed = running && exec.startedAt ? Math.max(0, now - exec.startedAt) : undefined
  const slow = elapsed !== undefined && elapsed >= WARN_AFTER_MS

  /*
    Um fundo só, para os três estados. Pintar o card inteiro de verde ou vermelho
    dava a uma chamada de ferramenta o mesmo peso visual da resposta — o status
    cabe no ícone à direita.
  */
  const bg = 'bg-[var(--p-surface)] border-[var(--p-line)]'

  const body = exec.text.length > MAX_PREVIEW
    ? exec.text.slice(0, MAX_PREVIEW) + '\n' + t('tool.omitted', { n: exec.text.length - MAX_PREVIEW })
    : exec.text

  return (
    <div className={`my-2 overflow-hidden rounded-card border transition-colors ${bg}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-elevated"
      >
        <ChevronRight
          size={14}
          className={'shrink-0 text-dim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <IconCommand size={14} className="shrink-0 text-dim" />
        <span className="flex-1 truncate font-mono text-sm text-dim">
          {summary(exec.name, exec.args)}
        </span>

        {exec.kernelRestarted && (
          <span className="shrink-0" title={t('tool.kernelRestarted')}>
            <RotateCcw size={14} className="text-warn" />
          </span>
        )}
        {exec.durationMs !== undefined && !running && (
          <span className="shrink-0 font-mono text-xs text-dim">{fmtDuration(exec.durationMs)}</span>
        )}
        {elapsed !== undefined && (
          <span
            className={'shrink-0 font-mono text-xs tabular-nums ' + (slow ? 'text-warn' : 'text-dim')}
            title={slow ? t('tool.slowHint') : undefined}
          >
            {fmtElapsed(elapsed)}
          </span>
        )}
        {running && (
          <Loader2
            size={14}
            className={'shrink-0 animate-spin ' + (slow ? 'text-warn' : 'text-primary')}
          />
        )}
        {exec.status === 'ok' && <IconDone className="shrink-0 text-ok" />}
        {failed && <IconFailed className="shrink-0 text-err" />}
      </button>

      {/*
        O motivo da falha, sem precisar abrir.

        Antes a falha era só o ícone no cabeçalho: para saber POR QUE, era
        preciso expandir o cartão — e num turno com seis chamadas isso é seis
        cliques para achar a que quebrou. A primeira linha do erro é onde a
        causa costuma estar; o resto continua dentro.
      */}
      {failed && !open && motivo && (
        <div className="flex items-start gap-2 border-t border-err/20 bg-err/[0.06] px-3 py-2">
          <IconFailed size={13} className="mt-[2px] shrink-0 text-err" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs leading-snug text-err">
            {motivo}
          </span>
        </div>
      )}

      {open && (
        <div className="animate-fade-up border-t border-[var(--p-line)]">
          {code && (
            <pre className="overflow-x-auto border-b border-[var(--p-line)] bg-[var(--p-bg)] px-4 py-3 font-mono text-sm leading-relaxed text-mint">
              {code}
            </pre>
          )}
          {body ? (
            <pre className="max-h-[380px] overflow-auto px-4 py-3 font-mono text-sm leading-relaxed text-muted whitespace-pre-wrap">
              {body}
            </pre>
          ) : (
            <div className="px-4 py-3 text-sm italic text-dim">
              {running ? t('tool.running') : t('tool.noOutput')}
            </div>
          )}
          {exec.stderr && (
            <pre className="max-h-48 overflow-auto border-t border-[var(--p-line)] px-4 py-3 font-mono text-sm text-err whitespace-pre-wrap">
              {exec.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
