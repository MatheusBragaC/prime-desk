import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Modal, Button } from './Modal'
import { useAgent } from '@/store/agent'
import { useT } from '@/i18n'

/**
 * Diálogo de confirmação único do app.
 *
 * Qualquer componente pede uma confirmação com `requestConfirm(...)` na store,
 * em vez de embutir o próprio "tem certeza?" — assim todo aviso destrutivo tem
 * a mesma cara e o mesmo comportamento de teclado.
 */
export function ConfirmDialog() {
  const { t } = useT()
  const confirm = useAgent((s) => s.confirm)
  const close = useAgent((s) => s.closeConfirm)
  const [busy, setBusy] = useState(false)

  if (!confirm) return null

  async function run() {
    if (!confirm) return
    setBusy(true)
    try {
      await confirm.onConfirm()
    } finally {
      setBusy(false)
      close()
    }
  }

  return (
    <Modal
      open
      title={confirm.title}
      onClose={busy ? () => {} : close}
      width={420}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={confirm.danger ? 'danger' : 'accent'}
            onClick={() => void run()}
            disabled={busy}
            icon={busy ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : undefined}
          >
            {busy ? t('common.processing') : (confirm.confirmLabel ?? t('common.confirm'))}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {confirm.danger && (
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-err" />
        )}
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-fg">{confirm.message}</p>
          {confirm.detail && (
            <p className="mt-2 break-words rounded-lg border border-[var(--p-line)] bg-codeWell p-2.5 font-mono text-xs leading-snug text-dim">
              {confirm.detail}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
