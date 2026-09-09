import { AlertTriangle, Loader2 } from 'lucide-react'
import { useT } from '../i18n'

/**
 * Estados de carga dos painéis.
 *
 * Cada painel desenhava os seus: a árvore de agentes e o explorador usam cartão
 * vermelho para erro, o painel de alterações usava texto centrado cinza — o que
 * fazia falha de leitura parecer resultado vazio. Aqui erro é sempre erro.
 */

export function PanelError({ message }: { message: string }) {
  return (
    <div className="mx-3 my-2 flex items-start gap-2 rounded-lg border border-err/25 bg-err/[0.07] p-2.5 text-xs text-err">
      <AlertTriangle size={14} strokeWidth={1.75} className="mt-[1px] shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  )
}

export function PanelEmpty({ message }: { message: string }) {
  return <div className="px-4 py-8 text-center text-sm text-dim">{message}</div>
}

export function PanelLoading({ message }: { message?: string }) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-dim">
      <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
      {message ?? t('common.loading')}
    </div>
  )
}
