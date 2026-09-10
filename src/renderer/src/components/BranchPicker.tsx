import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, Check, Loader2, AlertTriangle } from 'lucide-react'
import { useAgent } from '@/store/agent'
import { usePopover } from '@/lib/usePopover'
import { useT } from '@/i18n'
import type { GitBranchInfo } from '@shared/protocol'

/**
 * Ramo do git na barra de contexto, agora clicável.
 *
 * Era texto morto. Trocar de ramo exigia sair do app, e o rótulo aqui só era
 * relido quando o diretório mudava — depois de um checkout externo ele ficava
 * mostrando o ramo antigo até você trocar de conversa.
 *
 * Este componente é dono do próprio estado por isso: quem troca o ramo é ele,
 * então quem sabe releer é ele.
 *
 * O checkout é o do git, sem `-f` e sem `stash` automático. Com alteração que
 * seria sobrescrita o git recusa e diz quais arquivos são — e a mensagem
 * aparece aqui. Descartar trabalho da pessoa não é decisão do app.
 */
export function BranchPicker({ chipClass }: { chipClass: string }) {
  const { t } = useT()
  const cwd = useAgent((s) => s.cwd)
  const streaming = useAgent((s) => s.state?.isStreaming ?? false)
  const notify = useAgent((s) => s.notify)
  const requestConfirm = useAgent((s) => s.requestConfirm)

  const [branches, setBranches] = useState<GitBranchInfo[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trigger = useRef<HTMLButtonElement>(null)
  const menuRef = usePopover<HTMLDivElement>(() => setOpen(false), open, trigger)

  const reload = useCallback(async () => {
    const r = await window.prime.gitBranches()
    if (!r.ok) {
      setBranches(null)
      return
    }
    setBranches(r.branches)
    setDirty(r.dirty)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, cwd])

  const current = branches?.find((b) => b.current)?.name ?? null

  const checkout = useCallback(async (name: string) => {
    setOpen(false)
    setSwitching(name)
    setError(null)
    const r = await window.prime.gitCheckout(name)
    setSwitching(null)
    await reload()

    if (!r.ok) {
      // A mensagem do git nomeia os arquivos em conflito: vale mais que um
      // "falhou" nosso, e por isso vai inteira para o aviso.
      const message = r.error ?? t('branch.failed')
      setError(message)
      notify('error', message)
      return
    }
    notify('info', t('branch.switched', { name }))
  }, [notify, reload, t])

  const ask = useCallback((name: string) => {
    /*
      Trocar o ramo debaixo de um turno em andamento muda os arquivos que o
      agente está lendo no meio do caminho. O git não tem como saber disso, e o
      resultado é o agente raciocinando sobre um código que já não existe.
    */
    if (streaming) {
      requestConfirm({
        title: t('branch.busyTitle'),
        message: t('branch.busyMsg'),
        detail: name,
        confirmLabel: t('branch.switchAnyway'),
        danger: true,
        onConfirm: () => checkout(name)
      })
      return
    }
    void checkout(name)
  }, [checkout, requestConfirm, streaming, t])

  // Fora de repositório não há o que mostrar — mesmo comportamento de antes.
  if (!current) return null

  return (
    <>
      <span className="select-none text-xs text-grid">·</span>
      <div className="relative">
        <button
          ref={trigger}
          onClick={() => {
            setOpen((v) => !v)
            void reload()
          }}
          className={chipClass}
          title={t('branch.title')}
        >
          {switching ? (
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
          ) : (
            <GitBranch size={14} strokeWidth={1.75} />
          )}
          <span className="max-w-[180px] truncate">{switching ?? current}</span>
          {dirty && (
            <span
              title={t('branch.dirty')}
              className="h-1 w-1 shrink-0 rounded-full bg-warn"
            />
          )}
        </button>

        {open && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-0 z-dropdown mb-2 max-h-[300px] w-[300px] overflow-y-auto animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70"
          >
            <div className="px-2 py-1 text-micro uppercase tracking-wider text-dim">
              {t('branch.local', { n: branches?.length ?? 0 })}
            </div>

            {branches?.map((b) => (
              <button
                key={b.name}
                onClick={() => !b.current && ask(b.name)}
                disabled={b.current}
                className={
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ' +
                  (b.current
                    ? 'text-fg'
                    : 'text-muted hover:bg-white/[0.06] hover:text-fg')
                }
              >
                <GitBranch size={13} strokeWidth={1.75} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate" title={b.upstream ?? b.name}>
                  {b.name}
                </span>
                {b.current && (
                  <Check size={13} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
                )}
              </button>
            ))}

            {dirty && (
              <div className="mt-1 flex items-start gap-2 border-t border-[var(--p-line)] px-2 pt-1.5 text-micro leading-snug text-warn">
                <AlertTriangle size={12} strokeWidth={1.75} className="mt-[2px] shrink-0" />
                {t('branch.dirtyNote')}
              </div>
            )}

            {error && (
              <div className="mt-1 whitespace-pre-wrap border-t border-[var(--p-line)] px-2 pt-1.5 text-micro leading-snug text-err">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
