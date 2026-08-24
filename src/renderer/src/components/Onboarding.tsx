import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2, Circle, Loader2, Download, Terminal, KeyRound, RefreshCw,
  Copy, Check, ArrowRight, AlertTriangle
} from 'lucide-react'
import { Butterfly } from './Butterfly'
import { Button } from './Modal'
import { useT } from '../i18n'

interface EnvStatus {
  agent: { installed: boolean; path: string | null; version: string | null }
  auth: { ok: boolean; providers: string[]; envKeys: string[] }
}

type Stage = 'checking' | 'install' | 'installing' | 'auth' | 'ready'

function StepRow({
  done,
  busy,
  title,
  detail
}: {
  done: boolean
  busy?: boolean
  title: string
  detail?: string
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {busy ? (
        <Loader2 size={15} className="mt-[1px] shrink-0 animate-spin text-primary" />
      ) : done ? (
        <CheckCircle2 size={15} className="mt-[1px] shrink-0 text-ok" />
      ) : (
        <Circle size={15} className="mt-[1px] shrink-0 text-dim" />
      )}
      <div className="min-w-0">
        <div className={'text-[13px] ' + (done ? 'text-fg' : 'text-muted')}>{title}</div>
        {detail && <div className="mt-0.5 truncate font-mono text-[11px] text-dim">{detail}</div>}
      </div>
    </div>
  )
}

export function Onboarding({ onReady }: { onReady: () => void }) {
  const { t } = useT()
  const [status, setStatus] = useState<EnvStatus | null>(null)
  const [stage, setStage] = useState<Stage>('checking')
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const check = useCallback(async (): Promise<EnvStatus | null> => {
    const r = await window.prime.checkEnvironment()
    if (!r?.ok) {
      setError(r?.error ?? t('onb.checkFailed'))
      return null
    }
    const s = r.status as EnvStatus
    setStatus(s)
    if (!s.agent.installed) setStage('install')
    else if (!s.auth.ok) setStage('auth')
    else setStage('ready')
    return s
  }, [])

  useEffect(() => {
    void window.prime.installCommand().then((r) => {
      if (r?.ok) setCommand(r.command as string)
    })
    const off = window.prime.on('onboarding:output', (chunk) => {
      setOutput((o) => (o + String(chunk)).slice(-6000))
    })
    // Pequena espera antes da primeira checagem: a tela não deve piscar.
    const t = setTimeout(() => void check(), 450)
    return () => {
      off()
      clearTimeout(t)
    }
  }, [check])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [output])

  // Quando tudo está pronto, sai sozinho — sem exigir mais um clique.
  useEffect(() => {
    if (stage !== 'ready') return
    const t = setTimeout(onReady, 700)
    return () => clearTimeout(t)
  }, [stage, onReady])

  async function install() {
    setStage('installing')
    setOutput('')
    setError(null)
    const r = await window.prime.installAgent()
    if (!r?.ok) {
      setError(t('onb.installFailed'))
      setStage('install')
      return
    }
    await check()
  }

  async function copyCommand() {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const agentOk = Boolean(status?.agent.installed)
  const authOk = Boolean(status?.auth.ok)

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--p-bg)] px-8">
      <div className="aurora pointer-events-none absolute inset-0" />

      <div className="relative z-10 w-full max-w-[520px]">
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Butterfly size={46} className={stage === 'checking' ? 'animate-pulse-soft' : ''} />
          <h1 className="mt-3.5 text-[20px] font-semibold tracking-tight">{t('onb.welcome')}</h1>
          <p className="mt-1.5 max-w-[400px] text-[12.8px] leading-relaxed text-muted">
            {t('onb.intro')}
          </p>
        </div>

        <div
          className="animate-fade-up mt-6 rounded-xl border border-white/[0.08] bg-[var(--p-surface)] p-4"
          style={{ animationDelay: '90ms' }}
        >
          <StepRow
            done={agentOk}
            busy={stage === 'checking' || stage === 'installing'}
            title={t('onb.stepAgent')}
            detail={
              status?.agent.version
                ? `${t('onb.version')} ${status.agent.version} · ${status.agent.path}`
                : stage === 'checking'
                  ? t('onb.checking')
                  : t('onb.notFound')
            }
          />
          <StepRow
            done={authOk}
            busy={stage === 'checking'}
            title={t('onb.stepAuth')}
            detail={
              status?.auth.providers.length
                ? `auth.json: ${status.auth.providers.join(', ')}`
                : status?.auth.envKeys.length
                  ? `${t('onb.envVar')}: ${status.auth.envKeys.join(', ')}`
                  : stage === 'checking'
                    ? t('onb.checking')
                    : t('onb.noCreds')
            }
          />
        </div>

        {error && (
          <div className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl border border-err/25 bg-err/[0.07] p-3 text-[12.3px] leading-snug text-err">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            {error}
          </div>
        )}

        {/* ---------------- instalar ---------------- */}
        {(stage === 'install' || stage === 'installing') && (
          <div
            className="animate-fade-up mt-3 rounded-xl border border-white/[0.08] bg-[var(--p-surface)] p-4"
            style={{ animationDelay: '150ms' }}
          >
            <div className="text-[13px] font-medium">{t('onb.installTitle')}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {t('onb.installDesc')}
            </p>

            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-white/[0.08] bg-black/35 p-2.5">
              <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-mint">
                {command}
              </code>
              <button
                onClick={() => void copyCommand()}
                className="shrink-0 rounded p-1 text-dim transition-colors hover:text-fg"
                title={t('common.copy')}
              >
                {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => void install()}
                disabled={stage === 'installing'}
              >
                <span className="flex items-center gap-1.5">
                  {stage === 'installing' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  {stage === 'installing' ? t('onb.installing') : t('onb.installNow')}
                </span>
              </Button>
              <Button variant="subtle" onClick={() => void check()}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={12} />
                  {t('onb.alreadyInstalled')}
                </span>
              </Button>
            </div>

            {output && (
              <pre
                ref={logRef}
                className="mt-3 max-h-[150px] overflow-auto rounded-lg border border-white/[0.07] bg-black/40 p-2.5 font-mono text-[10.8px] leading-snug text-muted"
              >
                {output}
              </pre>
            )}
          </div>
        )}

        {/* ---------------- autenticar ---------------- */}
        {stage === 'auth' && (
          <div
            className="animate-fade-up mt-3 rounded-xl border border-white/[0.08] bg-[var(--p-surface)] p-4"
            style={{ animationDelay: '150ms' }}
          >
            <div className="text-[13px] font-medium">{t('onb.authTitle')}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {t('onb.authDesc')}
            </p>

            <button
              onClick={() => void window.prime.openAgentTerminal()}
              className="mt-3 flex w-full items-start gap-3 rounded-lg border border-white/[0.08] p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06]"
            >
              <Terminal size={15} className="mt-[2px] shrink-0 text-primarySoft" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.8px] font-medium text-fg">
                  {t('onb.subTitle')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-dim">
                  {t('onb.subDesc')}
                </span>
              </span>
              <ArrowRight size={13} className="mt-[3px] shrink-0 text-dim" />
            </button>

            <div className="mt-2 flex items-start gap-3 rounded-lg border border-white/[0.08] p-3">
              <KeyRound size={15} className="mt-[2px] shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.8px] font-medium text-fg">{t('onb.keyTitle')}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-dim">
                  {t('onb.keyDesc')}
                </div>
                <code className="mt-1.5 block break-all rounded border border-white/[0.07] bg-black/35 p-2 font-mono text-[11px] text-mint">
                  export ANTHROPIC_API_KEY=sk-ant-…
                </code>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-warn/25 bg-warn/[0.06] p-2.5 text-[11px] leading-relaxed text-warn">
              {t('onb.billing')}
            </div>

            <div className="mt-3">
              <Button variant="primary" onClick={() => void check()}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={12} />
                  {t('onb.recheck')}
                </span>
              </Button>
            </div>
          </div>
        )}

        {stage === 'ready' && (
          <div className="animate-fade-up mt-4 flex items-center justify-center gap-2 text-[13px] text-ok">
            <CheckCircle2 size={15} />
            {t('onb.allSet')}
          </div>
        )}
      </div>
    </div>
  )
}
