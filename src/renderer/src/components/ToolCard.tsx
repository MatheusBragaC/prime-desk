import { useState } from 'react'
import { ChevronRight, Terminal, Check, X, Loader2, RotateCcw, CircleSlash } from 'lucide-react'
import type { ToolExec } from '../store/agent'
import { fmtDuration } from '../lib/format'
import { useT } from '../i18n'

const MAX_PREVIEW = 4000

function codeFrom(args: Record<string, unknown>): string | null {
  const code = args?.code
  if (typeof code === 'string') return code
  const cmd = args?.command
  if (typeof cmd === 'string') return cmd
  return null
}

function summary(name: string, args: Record<string, unknown>): string {
  const code = codeFrom(args)
  if (code) {
    const isBash = code.trimStart().startsWith('%%bash')
    // A linha da magic `%%bash` não informa nada: mostra o primeiro comando real.
    const meaningful = code
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('%%') && !l.startsWith('#'))
    const first = meaningful[0] ?? code.trim()
    const label = isBash ? 'shell' : name
    return `${label} · ${first.slice(0, 74)}`
  }
  const keys = Object.keys(args ?? {})
  return keys.length ? `${name} · ${keys.slice(0, 3).join(', ')}` : name
}

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
          <Loader2 size={14} strokeWidth={1.75} className="animate-spin text-primary" />
          <span>{t('tool.preparing', { name: pendingName ?? 'tool' })}</span>
        </div>
      )
    }

    return (
      <div
        title={t('tool.noResultHint')}
        className="my-2 flex items-center gap-2 rounded-card border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-sm text-warn"
      >
        <CircleSlash size={14} strokeWidth={1.75} className="shrink-0" />
        <span className="font-mono text-sm opacity-80">{pendingName ?? 'tool'}</span>
        <span className="opacity-90">· {t('tool.noResult')}</span>
      </div>
    )
  }

  const running = exec.status === 'running'
  const failed = exec.status === 'error'
  const code = codeFrom(exec.args)

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
          size={14} strokeWidth={1.75}
          className={'shrink-0 text-dim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <Terminal size={14} strokeWidth={1.75} className="shrink-0 text-dim" />
        <span className="flex-1 truncate font-mono text-sm text-dim">
          {summary(exec.name, exec.args)}
        </span>

        {exec.kernelRestarted && (
          <span className="shrink-0" title={t('tool.kernelRestarted')}>
            <RotateCcw size={14} strokeWidth={1.75} className="text-warn" />
          </span>
        )}
        {exec.durationMs !== undefined && !running && (
          <span className="shrink-0 font-mono text-xs text-dim">{fmtDuration(exec.durationMs)}</span>
        )}
        {running && <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin text-primary" />}
        {exec.status === 'ok' && <Check size={14} strokeWidth={1.75} className="shrink-0 text-ok" />}
        {failed && <X size={14} strokeWidth={1.75} className="shrink-0 text-err" />}
      </button>

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
