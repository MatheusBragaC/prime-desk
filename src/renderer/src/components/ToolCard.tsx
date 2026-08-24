import { useState } from 'react'
import { ChevronRight, Terminal, Check, X, Loader2, RotateCcw } from 'lucide-react'
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

export function ToolCard({ exec, pendingName }: { exec?: ToolExec; pendingName?: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)

  if (!exec) {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-[10px] border border-white/[0.07] bg-[var(--p-tool-pending)] px-3 py-2 text-[12.5px] text-dim">
        <Loader2 size={13} className="animate-spin text-primary" />
        <span>{t('tool.preparing', { name: pendingName ?? 'tool' })}</span>
      </div>
    )
  }

  const running = exec.status === 'running'
  const failed = exec.status === 'error'
  const code = codeFrom(exec.args)

  const bg = failed
    ? 'bg-[var(--p-tool-error)] border-[rgba(208,111,130,0.28)]'
    : running
      ? 'bg-[var(--p-tool-pending)] border-[rgba(124,111,175,0.3)]'
      : 'bg-[var(--p-tool-success)] border-white/[0.07]'

  const body = exec.text.length > MAX_PREVIEW
    ? exec.text.slice(0, MAX_PREVIEW) + '\n' + t('tool.omitted', { n: exec.text.length - MAX_PREVIEW })
    : exec.text

  return (
    <div className={`my-1.5 overflow-hidden rounded-[10px] border transition-colors ${bg}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronRight
          size={13}
          className={'shrink-0 text-dim transition-transform duration-200 ' + (open ? 'rotate-90' : '')}
        />
        <Terminal size={12.5} className="shrink-0 text-muted" />
        <span className="flex-1 truncate font-mono text-[12.3px] text-muted">
          {summary(exec.name, exec.args)}
        </span>

        {exec.kernelRestarted && (
          <span className="shrink-0" title={t('tool.kernelRestarted')}>
            <RotateCcw size={12} className="text-warn" />
          </span>
        )}
        {exec.durationMs !== undefined && !running && (
          <span className="shrink-0 font-mono text-[11px] text-dim">{fmtDuration(exec.durationMs)}</span>
        )}
        {running && <Loader2 size={13} className="shrink-0 animate-spin text-primary" />}
        {exec.status === 'ok' && <Check size={13} className="shrink-0 text-ok" />}
        {failed && <X size={13} className="shrink-0 text-err" />}
      </button>

      {open && (
        <div className="animate-fade-up border-t border-white/[0.06]">
          {code && (
            <pre className="overflow-x-auto border-b border-white/[0.06] bg-[#08080a] px-3.5 py-2.5 font-mono text-[12.2px] leading-relaxed text-mint">
              {code}
            </pre>
          )}
          {body ? (
            <pre className="max-h-[420px] overflow-auto px-3.5 py-2.5 font-mono text-[12.2px] leading-relaxed text-[#c9c9d1] whitespace-pre-wrap">
              {body}
            </pre>
          ) : (
            <div className="px-3.5 py-2.5 text-[12.2px] italic text-dim">
              {running ? t('tool.running') : t('tool.noOutput')}
            </div>
          )}
          {exec.stderr && (
            <pre className="max-h-48 overflow-auto border-t border-white/[0.06] px-3.5 py-2.5 font-mono text-[12.2px] text-err whitespace-pre-wrap">
              {exec.stderr}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
