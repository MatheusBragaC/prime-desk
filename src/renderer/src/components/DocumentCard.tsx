import { useEffect } from 'react'
import { FileText, ExternalLink, PanelRight } from 'lucide-react'
import { useAgent } from '@/store/agent'
import type { DetectedDocument } from '@/lib/documentDetect'
import { useT } from '@/i18n'

/**
 * Substitui a parede de texto de um documento por um cartão compacto.
 *
 * Fica ao vivo enquanto o bloco ainda está sendo transmitido: se este `id` já
 * é o documento aberto no painel, o texto atualiza a cada quadro — assim quem
 * abriu cedo não vê o painel parar de crescer.
 */
export function DocumentCard({
  id,
  text,
  detected,
  streaming
}: {
  id: string
  text: string
  detected: DetectedDocument
  streaming: boolean
}) {
  const { t } = useT()
  const isOpen = useAgent((s) => s.document?.id === id)
  const updateDocumentIfOpen = useAgent((s) => s.updateDocumentIfOpen)
  const openDocument = useAgent((s) => s.openDocument)
  const requestDock = useAgent((s) => s.requestDock)

  // Atualiza o painel só se este documento já é o que está aberto nele.
  useEffect(() => {
    updateDocumentIfOpen(id, text)
  }, [id, text, updateDocumentIfOpen])

  function open() {
    openDocument({ id, title: detected.title, text })
    requestDock('document')
  }

  return (
    <button
      onClick={open}
      className={
        'group/doc my-2 flex w-full max-w-[420px] items-start gap-3 rounded-card border px-3.5 py-3 text-left transition-colors ' +
        (isOpen
          ? 'border-primary/35 bg-primary/[0.06]'
          : 'border-[var(--p-line)] bg-[var(--p-surface)] hover:border-white/20 hover:bg-elevated')
      }
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primarySoft">
        <FileText size={16} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{detected.title}</div>
        <div className="mt-0.5 text-xs text-dim">
          {streaming
            ? t('document.writing')
            : t('document.sections', { n: detected.headingCount })}
        </div>
      </div>
      <div className="mt-1 shrink-0 text-dim transition-colors group-hover/doc:text-fg">
        {isOpen ? (
          <PanelRight size={15} strokeWidth={1.75} />
        ) : (
          <ExternalLink size={15} strokeWidth={1.75} />
        )}
      </div>
    </button>
  )
}
