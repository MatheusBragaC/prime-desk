import type { RefObject } from 'react'
import { Check, Monitor, Plus, Terminal, Trash2 } from 'lucide-react'
import { usePopover } from '@/lib/usePopover'
import type { ExecutionInfo, SshConnection } from '@shared/protocol'
import { useT } from '@/i18n'

/**
 * Menu de contexto de execução.
 *
 * Só existem duas opções reais: local (padrão) e SSH, esta última fornecida pela
 * extensão `examples/extensions/ssh.ts` do próprio prime-agent, que troca as
 * operações de `bash` e `edit` por execução remota. Não há modo "Cloud" nem
 * "Remote Control" no prime-agent — não seriam botões, seriam enfeite.
 */
export function ExecutionMenu({
  execution,
  connections,
  onLocal,
  onConnect,
  onRemove,
  onAdd,
  onClose,
  trigger
}: {
  execution: ExecutionInfo
  connections: SshConnection[]
  onLocal: () => void
  onConnect: (c: SshConnection) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onClose: () => void
  trigger: RefObject<HTMLElement | null>
}) {
  const { t } = useT()
  const ref = usePopover<HTMLDivElement>(onClose, true, trigger)

  const item =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg'

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-dropdown mb-2 w-[284px] animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70"
    >
      <button className={item} onClick={onLocal}>
        <Monitor size={14} strokeWidth={1.75} />
        <span className="flex-1">{t('exec.local')}</span>
        {execution.kind === 'local' && <Check size={14} strokeWidth={1.75} className="text-primarySoft" />}
      </button>

      {connections.length > 0 && (
        <>
          <div className="mt-1 px-2 py-1 text-micro uppercase tracking-wider text-dim">
            {t('exec.connections')}
          </div>
          {connections.map((c) => {
            const active = execution.kind === 'ssh' && execution.target === c.host
            return (
              <div key={c.id} className="group/conn relative">
                <button className={item + ' pr-7'} onClick={() => onConnect(c)}>
                  <Terminal size={14} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.name}</span>
                    <span className="block truncate font-mono text-micro text-dim">
                      {c.host}
                      {c.port ? `:${c.port}` : ''}
                    </span>
                  </span>
                  {active && <Check size={14} strokeWidth={1.75} className="shrink-0 text-primarySoft" />}
                </button>
                <button
                  onClick={() => onRemove(c.id)}
                  title={t('exec.removeConn')}
                  className="absolute right-1 top-2 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover/conn:opacity-100"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            )
          })}
        </>
      )}

      <div className="mt-1 border-t border-[var(--p-line)] pt-1">
        <button className={item} onClick={onAdd}>
          <Plus size={14} strokeWidth={1.75} />
          {t('exec.addSsh')}
        </button>
      </div>

      <div className="px-2 pb-1 pt-1 text-micro leading-snug text-dim">
        {t('exec.note')}
      </div>
    </div>
  )
}
