import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { memo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { useT } from '../i18n'

function openExternal(e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault()
  const href = e.currentTarget.getAttribute('href')
  if (href) void window.prime.openExternal(href)
}

/** Bloco de código com botão de copiar. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useT()
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    // innerText preserva as quebras de linha do bloco renderizado.
    const text = ref.current?.innerText ?? ''
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="group/code relative">
      <pre ref={ref}>{children}</pre>
      <button
        onClick={() => void copy()}
        title={copied ? t('common.copied') : t('common.copyCode')}
        className={
          'absolute right-2 top-2 flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10.5px] transition-all ' +
          // Sempre visível, discreto: depender de hover esconde a ação de quem
          // usa trackpad/toque e de quem simplesmente não sabe que ela existe.
          (copied
            ? 'border-ok/40 bg-ok/15 text-ok opacity-100'
            : 'border-white/[0.09] bg-[var(--p-panel)] text-dim opacity-45 hover:border-white/20 hover:text-fg hover:opacity-100 group-hover/code:opacity-90')
        }
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? t('common.copied') : t('common.copy').toLowerCase()}
      </button>
    </div>
  )
}

export const Markdown = memo(function Markdown({
  text,
  highlight = true
}: {
  text: string
  /** Desligado durante o streaming: destacar a cada quadro é trabalho jogado fora. */
  highlight?: boolean
}) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={highlight ? [[rehypeHighlight, { detect: true, ignoreMissing: true }]] : []}
        components={{
          a: (props) => <a {...props} onClick={openExternal} />,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
