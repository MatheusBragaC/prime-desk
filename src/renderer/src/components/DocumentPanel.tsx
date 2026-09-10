import { useState } from 'react'
import { FileText, Copy, Check } from 'lucide-react'
import { DockPanel } from './DockPanel'
import { PanelEmpty } from './PanelState'
import { Markdown } from './Markdown'
import { useAgent } from '@/store/agent'
import { copyText } from '@/lib/clipboard'
import { useT } from '@/i18n'

/**
 * O "canto formatado" que falta no prime-agent — mas do lado do prime-desk.
 *
 * O agente não abre isto sozinho: não existe evento nem ferramenta de artifact
 * no protocolo (ver `lib/documentDetect.ts`). Quem decide que um texto é
 * documento é a heurística; quem decide abrir o painel é a pessoa, clicando no
 * card na conversa. Nada aqui se abre por conta própria — um painel que rouba
 * a tela no meio de um turno seria pior que o texto corrido que ele substitui.
 */
export function DocumentPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const doc = useAgent((s) => s.document)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!doc) return
    if (!(await copyText(doc.text, t('common.copyFailed')))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <DockPanel
      storageKey="document"
      defaultWidth={420}
      min={320}
      max={720}
      icon={<FileText size={16} strokeWidth={1.75} className="text-primarySoft" />}
      title={doc?.title || t('document.title')}
      onClose={onClose}
      actions={
        doc && (
          <button
            onClick={() => void copy()}
            className="no-drag rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
            title={copied ? t('common.copied') : t('common.copy')}
          >
            {copied ? (
              <Check size={15} strokeWidth={1.75} className="text-ok" />
            ) : (
              <Copy size={15} strokeWidth={1.75} />
            )}
          </button>
        )
      }
      bodyClassName="min-h-0 flex-1 overflow-y-auto px-4 py-3"
    >
      {doc ? <Markdown text={doc.text} /> : <PanelEmpty message={t('document.empty')} />}
    </DockPanel>
  )
}
