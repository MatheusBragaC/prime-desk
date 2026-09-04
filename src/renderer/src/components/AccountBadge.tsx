import { useCallback, useEffect, useState } from 'react'
import { UserRound, LogOut, RefreshCw, Terminal, KeyRound, Check, Globe, ChevronUp } from 'lucide-react'
import { useAgent } from '../store/agent'
import { useT, setLang, getLang, LANGS } from '../i18n'
import { usePopover } from '../lib/usePopover'

interface EnvStatus {
  agent: { installed: boolean; path: string | null; version: string | null }
  auth: { ok: boolean; providers: string[]; envKeys: string[] }
}

/**
 * Identidade do usuário no rodapé da sidebar.
 *
 * O Prime Desk não tem conta própria: o que existe é a credencial que o
 * `prime-agent` guarda. Mostramos o provedor autenticado e oferecemos entrar,
 * trocar e sair — sair equivale ao `/logout` do agente.
 */
export function AccountBadge({ onSignedOut }: { onSignedOut: () => void }) {
  const { t, lang } = useT()
  const [status, setStatus] = useState<EnvStatus | null>(null)
  const [open, setOpen] = useState(false)
  const requestConfirm = useAgent((s) => s.requestConfirm)
  const notify = useAgent((s) => s.notify)
  const ref = usePopover<HTMLDivElement>(() => setOpen(false), open)

  const refresh = useCallback(async () => {
    const r = await window.prime.checkEnvironment()
    if (r?.ok) setStatus(r.status as EnvStatus)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const provider = status?.auth.providers[0] ?? null
  const envKey = status?.auth.envKeys[0] ?? null
  const label = provider ?? (envKey ? envKey.replace('_API_KEY', '').toLowerCase() : null)
  const kind = provider ? t('acct.subscription') : envKey ? t('acct.apiKey') : null

  function askSignOut() {
    setOpen(false)
    if (!provider) {
      notify('info', t('acct.envCantLogout'))
      return
    }
    requestConfirm({
      title: t('acct.signOutTitle', { provider }),
      message: t('acct.signOutMsg', { provider }),
      confirmLabel: t('acct.signOut'),
      danger: true,
      onConfirm: async () => {
        const r = await window.prime.logoutProvider(provider)
        if (!r?.ok) {
          notify('error', r?.error ?? t('acct.signOutFailed'))
          return
        }
        notify('info', t('acct.signedOut', { provider }))
        await refresh()
        onSignedOut()
      }
    })
  }

  const item =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg'

  return (
    /*
      O rodapé é um bloco só — conta e pasta de trabalho — com uma régua acima
      dele. Antes cada linha trazia a própria `border-t`, e duas réguas em 70px
      liam como formulário. O item 8 do REDESIGN é explícito: separar por tom,
      não por linha.
    */
    <div ref={ref} className="group/acct relative border-t border-[var(--p-line)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        {/*
          Coluna de ícone de 20px, a mesma da linha de baixo: com 24px aqui e 14
          lá, os dois textos começavam em x diferentes. Sem preenchimento de
          destaque — o accent é o recurso mais caro da paleta e não se gasta em
          ícone decorativo; quem carrega a identidade é o nome.
        */}
        <span
          className={
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
            (label ? 'bg-white/[0.07] text-muted' : 'text-dim')
          }
        >
          <UserRound size={13} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm text-fg">
            {label ?? t('acct.none')}
          </span>
          {kind && <span className="block truncate text-micro text-dim">{kind}</span>}
        </span>
        <ChevronUp
          size={13} strokeWidth={1.75}
          className={
            'shrink-0 text-dim transition-all ' +
            (open ? 'rotate-180 opacity-100' : 'opacity-0 group-hover/acct:opacity-100')
          }
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-2 right-2 z-dropdown mb-1.5 animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70">
          <div className="px-2 py-1 text-micro uppercase tracking-wider text-dim">
            {t('lang.title')}
          </div>
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={item}
              onClick={() => {
                setLang(l.code)
                setOpen(false)
              }}
            >
              <Globe size={14} strokeWidth={1.75} />
              <span className="flex-1">{l.label}</span>
              {getLang() === l.code && <Check size={14} strokeWidth={1.75} className="text-primarySoft" />}
            </button>
          ))}

          <div className="my-1 border-t border-[var(--p-line)]" />

          <button
            className={item}
            onClick={() => {
              setOpen(false)
              void window.prime.openAgentTerminal().then((r) => {
                if (!r?.ok) notify('error', r?.error ?? t('onb.termFailed'))
              })
            }}
            title={t('acct.switchHint')}
          >
            <Terminal size={14} strokeWidth={1.75} />
            {label ? t('acct.switch') : t('acct.signIn')}
          </button>

          {envKey && !provider && (
            <div className="flex items-start gap-2 px-2 py-1.5 text-xs leading-snug text-dim">
              <KeyRound size={14} strokeWidth={1.75} className="mt-[2px] shrink-0" />
              {t('acct.envHint')}: <span className="font-mono">{envKey}</span>
            </div>
          )}

          <button className={item} onClick={() => void refresh()}>
            <RefreshCw size={14} strokeWidth={1.75} />
            {t('common.refresh')}
          </button>

          {provider && (
            <>
              <div className="my-1 border-t border-[var(--p-line)]" />
              <button className={item + ' text-err hover:text-err'} onClick={askSignOut}>
                <LogOut size={14} strokeWidth={1.75} />
                {t('acct.signOut')}
              </button>
            </>
          )}

          <div className="px-2 pb-1 pt-1 text-micro text-dim">
            {lang === 'pt' ? 'Credenciais ficam no prime-agent.' : lang === 'es' ? 'Las credenciales viven en prime-agent.' : 'Credentials live in prime-agent.'}
          </div>
        </div>
      )}
    </div>
  )
}
