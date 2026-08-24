import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Modal, Button } from './Modal'
import { useAgent } from '../store/agent'

/**
 * Diálogo de confirmação único do app.
 *
 * Qualquer componente pede uma confirmação com `requestConfirm(...)` na store,
 * em vez de embutir o próprio "tem certeza?" — assim todo aviso destrutivo tem
 * a mesma cara e o mesmo comportamento de teclado.
 */
export function ConfirmDialog() {
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
            Cancelar
          </Button>
          <Button
            variant={confirm.danger ? 'ghost' : 'primary'}
            onClick={() => void run()}
            disabled={busy}
            className={
              confirm.danger
                ? 'rounded-lg border border-err/40 bg-err/15 px-3 py-1.5 text-[12.5px] font-medium text-err transition-colors hover:bg-err/25 disabled:opacity-40'
                : undefined
            }
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                Processando
              </span>
            ) : (
              (confirm.confirmLabel ?? 'Confirmar')
            )}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {confirm.danger && (
          <AlertTriangle size={18} className="mt-[2px] shrink-0 text-err" />
        )}
        <div className="min-w-0">
          <p className="text-[13px] leading-relaxed text-fg">{confirm.message}</p>
          {confirm.detail && (
            <p className="mt-2 break-words rounded-lg border border-white/[0.07] bg-black/25 p-2.5 font-mono text-[11.5px] leading-snug text-dim">
              {confirm.detail}
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
