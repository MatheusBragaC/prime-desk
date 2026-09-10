import { useEffect, useState } from 'react'
import {
  UserRound, LogOut, RefreshCw, Terminal, KeyRound, Check, Globe, ChevronUp, ArrowUpCircle
} from 'lucide-react'
import { useAgent } from '@/store/agent'
import { useT, setLang, getLang, LANGS } from '@/i18n'
import { usePopover } from '@/lib/usePopover'
import { logoutProvider, providerLabel as labelFor } from '@/lib/env'
import { useEnvironment } from '@/lib/useEnvironment'

/**
 * Identidade do usuário no rodapé da sidebar.
 *
 * O Prime Desk não tem conta própria: o que existe é a credencial que o
 * `prime-agent` guarda. Mostramos o provedor autenticado e oferecemos entrar,
 * trocar e sair — sair equivale ao `/logout` do agente.
 *
 * Ambiente, nome e atualização vêm todos do `useEnvironment`: o badge só exibe.
 */
export function AccountBadge({ onSignedOut }: { onSignedOut: () => void }) {
  const { t } = useT()
  const { status, update, userName, refresh } = useEnvironment(true)
  const [open, setOpen] = useState(false)
  const requestConfirm = useAgent((s) => s.requestConfirm)
  const notify = useAgent((s) => s.notify)
  const requestTerminal = useAgent((s) => s.requestTerminal)
  const ref = usePopover<HTMLDivElement>(() => setOpen(false), open)

  // A primeira leitura é do badge: o hook guarda o dado, não decide quando ler.
  useEffect(() => {
    void refresh()
  }, [refresh])

  /*
    A atualização troca o binário que o app executa e reinicia o daemon, então:
    confirma, derruba a ponte, e roda à vista numa aba do terminal. Nunca por
    `execFile` no main — sem TTY o `prime-agent update` desiste quando há sessão
    ocupada, que é justamente quando o app está em uso.
  */
  function askUpdate() {
    setOpen(false)
    requestConfirm({
      title: t('update.title'),
      message: t('update.msg'),
      detail: `${update?.current ?? '?'} → ${update?.latest ?? '?'}`,
      confirmLabel: t('update.run'),
      onConfirm: async () => {
        await window.prime.stopBridge()
        requestTerminal('prime-agent update', t('update.tabTitle'))
      }
    })
  }

  const provider = status?.auth.providers[0] ?? null
  const envKey = status?.auth.envKeys[0] ?? null
  const signedIn = Boolean(provider || envKey)
  /** Como a credencial foi obtida — o que estava na segunda linha. */
  const kind = provider ? t('acct.subscription') : envKey ? t('acct.apiKey') : null
  /*
    A linha de cima passa a ser o nome da pessoa. `anthropic` é o provedor da
    credencial, não a identidade de ninguém: como rótulo principal soava como
    nome de usuário e não era. Desce para o menu, junto do resto do técnico.
    Sem nome do sistema, o provedor volta a servir de rótulo.
  */
  const providerLabel = labelFor(provider, envKey)
  const label = signedIn ? (userName || providerLabel) : null

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
        try {
          await logoutProvider(provider)
        } catch (err) {
          notify('error', err instanceof Error ? err.message : t('acct.signOutFailed'))
          return
        }
        notify('info', t('acct.signedOut', { provider }))
        await refresh()
        onSignedOut()
      }
    })
  }

  const item =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-hover hover:text-fg'

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
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raise"
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
            (label ? 'bg-chip text-muted' : 'text-dim')
          }
        >
          <UserRound size={13} strokeWidth={1.75} />
        </span>
        {update?.available && !open && (
          <span
            title={t('update.available')}
            className="absolute left-[26px] top-1.5 h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
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
        <div className="absolute bottom-full left-2 right-2 z-dropdown mb-1.5 animate-fade-up rounded-lg border border-lineStrong bg-[var(--p-panel)] p-1 shadow-2xl shadow-drop">
          {/* O provedor mora aqui: é de onde a credencial vem, não quem você é. */}
          {providerLabel && (
            <>
              <div className="flex items-baseline gap-2 px-2 py-1.5">
                <span className="text-micro uppercase tracking-wider text-dim">
                  {t('acct.provider')}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">
                  {providerLabel}
                </span>
              </div>
              <div className="my-1 border-t border-[var(--p-line)]" />
            </>
          )}

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
              // `/login` é interativo (escolha de provedor no TUI + OAuth no
              // navegador) e a GUI não o reimplementa. Antes isso abria uma
              // janela do gnome-terminal por fora; agora vai para o painel.
              requestTerminal('prime-agent', t('acct.loginTab'))
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

          {update?.available && (
            <button className={item + ' text-primarySoft hover:text-primarySoft'} onClick={askUpdate}>
              <ArrowUpCircle size={14} strokeWidth={1.75} />
              <span className="flex-1">{t('update.available')}</span>
              <span className="font-mono text-micro text-dim">{update.latest}</span>
            </button>
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
            {t('acct.credsNote')}
          </div>
        </div>
      )}
    </div>
  )
}
