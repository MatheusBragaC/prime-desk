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
        <Loader2 size={16} strokeWidth={1.75} className="mt-[1px] shrink-0 animate-spin text-primary" />
      ) : done ? (
        <CheckCircle2 size={16} strokeWidth={1.75} className="mt-[1px] shrink-0 text-ok" />
      ) : (
        <Circle size={16} strokeWidth={1.75} className="mt-[1px] shrink-0 text-dim" />
      )}
      <div className="min-w-0">
        <div className={'text-sm ' + (done ? 'text-fg' : 'text-muted')}>{title}</div>
        {detail && <div className="mt-0.5 truncate font-mono text-xs text-dim">{detail}</div>}
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
  const [termError, setTermError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [termOpened, setTermOpened] = useState(false)
  const [portBusy, setPortBusy] = useState<number | null>(null)
  const [auto, setAuto] = useState(false)
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

    /*
      O login acontece fora do app, num terminal. Em vez de exigir um clique em
      "já autentiquei", o main observa o diretório do agente e avisa quando as
      credenciais aparecem — aí a tela avança sozinha.
    */
    const offEnv = window.prime.on('onboarding:env', (payload) => {
      const s = payload as EnvStatus
      setStatus(s)
      if (!s.agent.installed) setStage('install')
      else if (!s.auth.ok) setStage('auth')
      else {
        setAuto(true)
        setStage('ready')
      }
    })
    void window.prime.watchEnvironment()
    // Pequena espera antes da primeira checagem: a tela não deve piscar.
    const t = setTimeout(() => void check(), 450)
    return () => {
      off()
      offEnv()
      void window.prime.unwatchEnvironment()
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

  /** Abre o terminal e, se não der, entrega o comando para o usuário rodar. */
  async function openTerminal() {
    setOpening(true)
    setTermError(null)
    setPortBusy(null)

    // Um login pendente em outra janela prende a porta do callback e faz o TUI
    // ignorar o Enter sem dizer nada. Melhor avisar antes de abrir mais um.
    const port = await window.prime.checkLoginPort()
    if (port && !port.free) {
      setPortBusy(port.port as number)
      setOpening(false)
      return
    }
    const r = await window.prime.openAgentTerminal()
    setOpening(false)
    if (!r?.ok) {
      setTermError(r?.error ?? 'Falha ao abrir terminal.')
      setTermOpened(false)
      return
    }
    // `/login` só existe dentro do TUI: passá-lo como argumento vira mensagem
    // para o modelo. Por isso o passo a passo fica aqui, explícito.
    setTermOpened(true)
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
      {/*
        Faixa de arraste: sem a barra de título nativa, esta tela não tinha
        nenhuma região `-webkit-app-region: drag` e a janela ficava presa.
      */}
      <div className="drag-region absolute inset-x-0 top-0 z-chrome h-[var(--p-titlebar)]" />
      <div className="aurora pointer-events-none absolute inset-0" />

      <div className="relative z-10 w-full max-w-[520px]">
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Butterfly size={46} className={stage === 'checking' ? 'animate-pulse-soft' : ''} />
          <h1 className="mt-3.5 text-xl font-semibold tracking-tight">{t('onb.welcome')}</h1>
          <p className="mt-1.5 max-w-[400px] text-sm leading-relaxed text-muted">
            {t('onb.intro')}
          </p>
        </div>

        <div
          className="animate-fade-up mt-6 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] p-4"
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
          <div className="animate-fade-up mt-3 flex items-start gap-2 rounded-xl border border-err/25 bg-err/[0.07] p-3 text-sm leading-snug text-err">
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-[2px] shrink-0" />
            {error}
          </div>
        )}

        {/* ---------------- instalar ---------------- */}
        {(stage === 'install' || stage === 'installing') && (
          <div
            className="animate-fade-up mt-3 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] p-4"
            style={{ animationDelay: '150ms' }}
          >
            <div className="text-sm font-medium">{t('onb.installTitle')}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t('onb.installDesc')}
            </p>

            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-[var(--p-line)] bg-black/35 p-2.5">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-mint">
                {command}
              </code>
              <button
                onClick={() => void copyCommand()}
                className="shrink-0 rounded p-1 text-dim transition-colors hover:text-fg"
                title={t('common.copy')}
              >
                {copied ? <Check size={14} strokeWidth={1.75} className="text-ok" /> : <Copy size={14} strokeWidth={1.75} />}
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
                    <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <Download size={14} strokeWidth={1.75} />
                  )}
                  {stage === 'installing' ? t('onb.installing') : t('onb.installNow')}
                </span>
              </Button>
              <Button variant="subtle" onClick={() => void check()}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={14} strokeWidth={1.75} />
                  {t('onb.alreadyInstalled')}
                </span>
              </Button>
            </div>

            {output && (
              <pre
                ref={logRef}
                className="mt-3 max-h-[150px] overflow-auto rounded-lg border border-[var(--p-line)] bg-black/40 p-2.5 font-mono text-micro leading-snug text-muted"
              >
                {output}
              </pre>
            )}
          </div>
        )}

        {/* ---------------- autenticar ---------------- */}
        {stage === 'auth' && (
          <div
            className="animate-fade-up mt-3 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] p-4"
            style={{ animationDelay: '150ms' }}
          >
            <div className="text-sm font-medium">{t('onb.authTitle')}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t('onb.authDesc')}
            </p>

            <button
              onClick={() => void openTerminal()}
              disabled={opening}
              className="mt-3 flex w-full items-start gap-3 rounded-lg border border-[var(--p-line)] p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.06]"
            >
              <Terminal size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-primarySoft" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">
                  {opening ? t('onb.opening') : t('onb.subTitle')}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-dim">
                  {t('onb.subDesc')}
                </span>
              </span>
              <ArrowRight size={14} strokeWidth={1.75} className="mt-[3px] shrink-0 text-dim" />
            </button>

            {portBusy !== null && (
              <div className="mt-2 animate-fade-up rounded-lg border border-warn/30 bg-warn/[0.07] p-3">
                <div className="flex items-start gap-2 text-xs leading-snug text-warn">
                  <AlertTriangle size={14} strokeWidth={1.75} className="mt-[2px] shrink-0" />
                  <span>
                    {t('onb.portBusy', { port: portBusy })}
                    <span className="mt-1.5 block">{t('onb.portBusyCmd')}</span>
                    <code className="mt-1 block rounded border border-white/[0.1] bg-black/40 p-2 font-mono text-micro text-mint">
                      pkill -f &quot;bash -lc prime-agent&quot;
                    </code>
                  </span>
                </div>
              </div>
            )}

            {termOpened && !termError && (
              <div className="mt-2 animate-fade-up rounded-lg border border-ok/25 bg-ok/[0.06] p-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-ok">
                  <CheckCircle2 size={14} strokeWidth={1.75} />
                  {t('onb.termOpened')}
                </div>
                <ol className="mt-2 space-y-1.5 text-xs leading-snug text-muted">
                  <li className="flex gap-2">
                    <span className="text-dim">1.</span>
                    <span>
                      {t('onb.step1', { cmd: '' })}
                      <code className="ml-1 rounded border border-white/[0.12] bg-black/40 px-1.5 py-0.5 font-mono text-xs text-mint">
                        /login
                      </code>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-dim">2.</span>
                    <span>{t('onb.step2')}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-dim">3.</span>
                    <span>{t('onb.step3', { label: t('onb.recheck') })}</span>
                  </li>
                </ol>
                <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--p-line)] pt-2 text-xs text-dim">
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  {t('onb.waiting')}
                </div>
              </div>
            )}

            {termError && (
              <div className="mt-2 animate-fade-up rounded-lg border border-warn/30 bg-warn/[0.07] p-3">
                <div className="flex items-start gap-2 text-xs leading-snug text-warn">
                  <AlertTriangle size={14} strokeWidth={1.75} className="mt-[2px] shrink-0" />
                  <span>
                    {t('onb.termFailed')}
                    <code className="mt-1.5 block rounded border border-white/[0.1] bg-black/40 p-2 font-mono text-xs text-mint">
                      prime-agent
                    </code>
                    <span className="mt-1 block">{t('onb.termThenLogin')}</span>
                    <span className="mt-1 block font-mono text-micro opacity-70">{termError}</span>
                  </span>
                </div>
              </div>
            )}

            <div className="mt-2 flex items-start gap-3 rounded-lg border border-[var(--p-line)] p-3">
              <KeyRound size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-fg">{t('onb.keyTitle')}</div>
                <div className="mt-0.5 text-xs leading-snug text-dim">
                  {t('onb.keyDesc')}
                </div>
                <code className="mt-1.5 block break-all rounded border border-[var(--p-line)] bg-black/35 p-2 font-mono text-xs text-mint">
                  export ANTHROPIC_API_KEY=sk-ant-…
                </code>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-warn/25 bg-warn/[0.06] p-2.5 text-xs leading-relaxed text-warn">
              {t('onb.billing')}
            </div>

            <div className="mt-3">
              <Button variant="primary" onClick={() => void check()}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={14} strokeWidth={1.75} />
                  {t('onb.recheck')}
                </span>
              </Button>
            </div>
          </div>
        )}

        {stage === 'ready' && (
          <div className="animate-fade-up mt-4 flex items-center justify-center gap-2 text-sm text-ok">
            <CheckCircle2 size={16} strokeWidth={1.75} />
            {auto ? `${t('onb.detected')} · ${t('onb.allSet')}` : t('onb.allSet')}
          </div>
        )}
      </div>
    </div>
  )
}
