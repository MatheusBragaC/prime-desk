import { WandSparkles } from '@/icons'
import { useT } from '@/i18n'

/**
 * Progresso do lote de títulos, visível sem hover: são alguns segundos por
 * conversa, e num lote de vinte isso passa de dois minutos. Um spinner
 * escondido em `title` de botão não serve para acompanhar.
 */
export function TitlingProgress({ done, total }: { done: number; total: number }) {
  const { t } = useT()

  return (
    <div className="mx-2 mb-1 flex items-center gap-2 rounded-sm bg-primary/[0.07] px-2 py-1.5 animate-fade-up">
      <WandSparkles
        size={13}
        className="shrink-0 animate-pulse-soft text-primarySoft"
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted">
        {t('sidebar.titlingProgress', { done, total })}
      </span>
      <span className="shrink-0 font-mono text-micro text-dim">
        {Math.round((done / total) * 100)}%
      </span>
    </div>
  )
}
