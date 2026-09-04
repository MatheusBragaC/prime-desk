import { useCallback, useEffect, useMemo, useState } from 'react'
import hljs from 'highlight.js'
import {
  X, Save, Pencil, Eye, Copy, ExternalLink, AlertTriangle, Loader2, FileWarning
} from 'lucide-react'
import { useT } from '../i18n'
import { fmtSize } from '../lib/format'

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', cjs: 'javascript', py: 'python', rb: 'ruby', go: 'go',
  rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp',
  php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', css: 'css',
  scss: 'scss', html: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', json: 'json',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', md: 'markdown',
  dockerfile: 'dockerfile', diff: 'diff', patch: 'diff'
}

function langOf(path: string): string | null {
  const base = path.split('/').pop() ?? ''
  if (/^dockerfile/i.test(base)) return 'dockerfile'
  const ext = base.split('.').pop()?.toLowerCase() ?? ''
  return LANG_BY_EXT[ext] ?? null
}

export function FileViewer({ path, onClose, active = true }: {
  path: string
  onClose: () => void
  /**
   * Falso quando o visor está montado mas escondido — caso das abas do painel
   * de terminal, que ficam todas montadas para não perder edição pendente ao
   * trocar de aba. Sem isso, cada instância escutaria o teclado da janela e um
   * Esc fecharia todos os arquivos abertos de uma vez.
   */
  active?: boolean
}) {
  const { t } = useT()
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [meta, setMeta] = useState<{ size: number; truncated?: boolean; binary?: boolean }>({ size: 0 })
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = editing && content !== original

  const load = useCallback(async () => {
    setState('loading')
    setEditing(false)
    const r = await window.prime.readFile(path)
    if (!r?.ok) {
      setError(r?.error ?? t('viewer.readFailed'))
      setState('error')
      return
    }
    setMeta({ size: r.size ?? 0, truncated: r.truncated, binary: r.binary })
    setContent(r.content ?? '')
    setOriginal(r.content ?? '')
    setState('ready')
  }, [path])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    if (!dirty || meta.truncated) return
    setSaving(true)
    const r = await window.prime.writeFile(path, content)
    setSaving(false)
    if (!r?.ok) {
      setError(r?.error ?? t('viewer.saveFailed'))
      return
    }
    setOriginal(content)
    setError(null)
  }, [content, dirty, meta.truncated, path])

  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
      if (e.key === 'Escape' && !dirty) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, dirty, onClose, active])

  const highlighted = useMemo(() => {
    if (editing || state !== 'ready' || meta.binary) return null
    const lang = langOf(path)
    try {
      return lang && hljs.getLanguage(lang)
        ? hljs.highlight(content, { language: lang }).value
        : hljs.highlightAuto(content).value
    } catch {
      return null
    }
  }, [content, editing, meta.binary, path, state])

  const lineCount = content ? content.split('\n').length : 0
  const name = path.split('/').pop() ?? path

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--p-bg)]">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-[var(--p-line)] px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{name}</span>
            {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Alterado" />}
          </div>
          <div className="truncate font-mono text-micro text-dim" title={path}>
            {path} · {fmtSize(meta.size)}
            {lineCount > 0 && ` · ${lineCount} ${t('viewer.lines')}`}
          </div>
        </div>

        {!meta.binary && state === 'ready' && (
          <>
            <button
              onClick={() => void navigator.clipboard.writeText(content)}
              className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-fg"
              title={t('viewer.copyContent')}
            >
              <Copy size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setEditing((v) => !v)}
              disabled={meta.truncated}
              className={
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40 ' +
                (editing ? 'bg-primary/15 text-primarySoft' : 'text-muted hover:bg-white/[0.06] hover:text-fg')
              }
              title={meta.truncated ? t('viewer.truncatedTitle') : t('viewer.edit')}
            >
              {editing ? <Eye size={14} strokeWidth={1.75} /> : <Pencil size={14} strokeWidth={1.75} />}
              {editing ? t('viewer.view') : t('viewer.edit')}
            </button>
            <button
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/15 px-2.5 py-1.5 text-sm text-fg transition-colors hover:bg-primary/25 disabled:border-[var(--p-line)] disabled:bg-transparent disabled:text-dim"
              title={t('viewer.saveTitle')}
            >
              {saving ? <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />}
              {t('viewer.save')}
            </button>
          </>
        )}

        <button
          onClick={() => void window.prime.revealFile(path)}
          className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-fg"
          title={t('files.openExternal')}
        >
          <ExternalLink size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {error && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-err/25 bg-err/[0.07] p-3 text-sm text-err">
          <AlertTriangle size={16} strokeWidth={1.75} className="mt-[2px] shrink-0" />
          {error}
        </div>
      )}

      {meta.truncated && (
        <div className="mx-5 mt-3 rounded-xl border border-warn/25 bg-warn/[0.06] p-2.5 text-sm text-warn">
          {t('viewer.truncated')}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {state === 'loading' && (
          <div className="flex h-full items-center justify-center text-sm text-dim">
            <Loader2 size={16} strokeWidth={1.75} className="mr-2 animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {state === 'ready' && meta.binary && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-dim">
            <FileWarning size={16} strokeWidth={1.75} />
            <span className="text-sm">{t('viewer.binary')}</span>
            <button
              onClick={() => void window.prime.revealFile(path)}
              className="mt-1 rounded-lg border border-white/[0.1] px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary/40 hover:text-fg"
            >
              {t('files.openExternal')}
            </button>
          </div>
        )}

        {state === 'ready' && !meta.binary && editing && (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none bg-[#08080a] px-5 py-4 font-mono text-sm leading-[1.65] text-[#c9c9d1] outline-none"
          />
        )}

        {state === 'ready' && !meta.binary && !editing && (
          <pre className="min-h-full bg-[#08080a] px-5 py-4 font-mono text-sm leading-[1.65]">
            <code
              className="hljs bg-transparent"
              dangerouslySetInnerHTML={{ __html: highlighted ?? '' }}
            />
          </pre>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--p-line)] px-5 py-2 text-xs text-dim">
        {editing ? t('viewer.editHint') : t('viewer.readHint')}
      </div>
    </div>
  )
}
