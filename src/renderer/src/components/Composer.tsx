import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Square, X, Command, Folder, GitBranch, Monitor, FolderTree, Plus, CornerDownLeft,
  FolderOpen, Check, Terminal, Trash2
} from 'lucide-react'
import { useAgent, sendPrompt, abortTurn } from '../store/agent'
import { ModelPicker, ThinkingPicker } from './ModelPicker'
import { SlashMenu } from './SlashMenu'
import { useMod } from '../lib/platform'
import { useT } from '../i18n'

export interface SshConnection {
  id: string
  name: string
  host: string
  port?: number
  identity?: string
  remotePath?: string
}

interface Attachment { path: string; data: string; mimeType: string }

/** Acima disso o payload em base64 fica grande demais para uma mensagem. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Converte um arquivo de imagem em anexo.
 *
 * Vem de colar ou arrastar, então não há caminho no disco para pedir ao main:
 * lemos pelo FileReader, que funciona com o renderer em sandbox.
 */
function fileToAttachment(file: File): Promise<Attachment | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null)
  if (file.size > MAX_IMAGE_BYTES) return Promise.resolve(null)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      if (comma < 0) return resolve(null)
      resolve({
        path: file.name || 'imagem',
        data: result.slice(comma + 1),
        mimeType: file.type
      })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/**
 * Menu de contexto de execução.
 *
 * Só existem duas opções reais: local (padrão) e SSH, esta última fornecida pela
 * extensão `examples/extensions/ssh.ts` do próprio prime-agent, que troca as
 * operações de `bash` e `edit` por execução remota. Não há modo "Cloud" nem
 * "Remote Control" no prime-agent — não seriam botões, seriam enfeite.
 */
function ExecutionMenu({
  execution,
  connections,
  onLocal,
  onConnect,
  onRemove,
  onAdd,
  onClose
}: {
  execution: { kind: 'local' | 'ssh'; target?: string }
  connections: SshConnection[]
  onLocal: () => void
  onConnect: (c: SshConnection) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onClose: () => void
}) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const item =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.3px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg'

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 w-[284px] animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70"
    >
      <button className={item} onClick={onLocal}>
        <Monitor size={12} />
        <span className="flex-1">{t('exec.local')}</span>
        {execution.kind === 'local' && <Check size={12} className="text-primarySoft" />}
      </button>

      {connections.length > 0 && (
        <>
          <div className="mt-1 px-2 py-1 text-[10px] uppercase tracking-wider text-dim">
            {t('exec.connections')}
          </div>
          {connections.map((c) => {
            const active = execution.kind === 'ssh' && execution.target === c.host
            return (
              <div key={c.id} className="group/conn relative">
                <button className={item + ' pr-7'} onClick={() => onConnect(c)}>
                  <Terminal size={12} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-dim">
                      {c.host}
                      {c.port ? `:${c.port}` : ''}
                    </span>
                  </span>
                  {active && <Check size={12} className="shrink-0 text-primarySoft" />}
                </button>
                <button
                  onClick={() => onRemove(c.id)}
                  title={t('exec.removeConn')}
                  className="absolute right-1 top-2 rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-err group-hover/conn:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </>
      )}

      <div className="mt-1 border-t border-white/[0.07] pt-1">
        <button className={item} onClick={onAdd}>
          <Plus size={12} />
          {t('exec.addSsh')}
        </button>
      </div>

      <div className="px-2 pb-1 pt-1 text-[10.5px] leading-snug text-dim">
        {t('exec.note')}
      </div>
    </div>
  )
}

/** Barra de contexto: onde o agente está executando. */
function ContextChips({
  home,
  onPickCwd,
  onToggleFiles,
  onSetExecution,
  connections,
  onOpenSshModal,
  onRemoveConnection
}: {
  home: string
  onPickCwd: () => void
  onToggleFiles: () => void
  onSetExecution: (conn: SshConnection | null) => void
  connections: SshConnection[]
  onOpenSshModal: () => void
  onRemoveConnection: (id: string) => void
}) {
  const { t } = useT()
  const cwd = useAgent((s) => s.cwd)
  const [branch, setBranch] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [execution, setExecution] = useState<{ kind: 'local' | 'ssh'; target?: string }>({
    kind: 'local'
  })

  useEffect(() => {
    void window.prime.execution().then((r) => {
      if (r?.ok) setExecution(r.execution as { kind: 'local' | 'ssh'; target?: string })
    })
  }, [cwd])

  useEffect(() => {
    let alive = true
    void window.prime.gitBranch().then((r) => {
      if (alive) setBranch(r?.ok ? (r.branch as string | null) : null)
    })
    return () => {
      alive = false
    }
  }, [cwd])

  const short = cwd
    ? cwd === home
      ? 'Home'
      : (cwd.split('/').filter(Boolean).pop() ?? cwd)
    : '—'

  const chip =
    'flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[var(--p-surface)] px-2.5 py-1 text-[11.5px] transition-colors'

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          className={chip + ' text-muted hover:border-primary/40 hover:text-fg'}
          title={t('chips.execTitle')}
        >
          {execution.kind === 'ssh' ? <Terminal size={11} /> : <Monitor size={11} />}
          {execution.kind === 'ssh' ? (execution.target ?? 'SSH') : t('exec.local')}
        </button>
        {menu && (
          <ExecutionMenu
            execution={execution}
            connections={connections}
            onLocal={() => {
              setMenu(false)
              onSetExecution(null)
            }}
            onConnect={(conn) => {
              setMenu(false)
              onSetExecution(conn)
            }}
            onRemove={(id) => onRemoveConnection(id)}
            onAdd={() => {
              setMenu(false)
              onOpenSshModal()
            }}
            onClose={() => setMenu(false)}
          />
        )}
      </div>

      <button
        onClick={onPickCwd}
        className={chip + ' text-muted hover:border-primary/40 hover:text-fg'}
        title={cwd || 'Escolher diretório de trabalho'}
      >
        <Folder size={11} className="text-primarySoft" />
        {short}
      </button>

      {branch && (
        <span className={chip + ' text-muted'} title={t('chips.branch')}>
          <GitBranch size={11} className="text-dim" />
          <span className="max-w-[180px] truncate">{branch}</span>
        </span>
      )}

      <button
        onClick={onToggleFiles}
        className={chip + ' text-muted hover:border-primary/40 hover:text-fg'}
        title={t('chips.filesTitle')}
      >
        <FolderTree size={11} />
        {t('chips.files')}
      </button>

      <button
        onClick={onPickCwd}
        className="flex items-center justify-center rounded-lg border border-white/[0.08] bg-[var(--p-surface)] px-2 py-1 text-dim transition-colors hover:border-primary/40 hover:text-fg"
        title={t('chips.pickDir')}
      >
        <FolderOpen size={12} />
      </button>
    </div>
  )
}

export function Composer({
  onOpenPalette,
  onPickCwd,
  onToggleFiles,
  onSetExecution,
  connections,
  onOpenSshModal,
  onRemoveConnection,
  home,
  draft,
  onDraftConsumed
}: {
  onOpenPalette: () => void
  onPickCwd: () => void
  onToggleFiles: () => void
  onSetExecution: (conn: SshConnection | null) => void
  connections: SshConnection[]
  onOpenSshModal: () => void
  onRemoveConnection: (id: string) => void
  home: string
  draft?: string
  onDraftConsumed?: () => void
}) {
  const { t } = useT()
  const [value, setValue] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null)
  const [slashCursor, setSlashCursor] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const commands = useAgent((s) => s.commands)
  const mod = useMod()
  const streaming = useAgent((s) => s.state?.isStreaming ?? false)
  const queued = useAgent((s) => s.state?.sessionActions?.queuedCount ?? 0)
  const ready = useAgent((s) => s.status === 'ready')

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 260) + 'px'
  }, [value])

  useEffect(() => {
    ta.current?.focus()
  }, [ready])

  // Arquivo escolhido no explorador entra como referência no prompt.
  useEffect(() => {
    if (!draft) return
    setValue((v) => (v ? `${v.trimEnd()} ${draft} ` : `${draft} `))
    ta.current?.focus()
    onDraftConsumed?.()
  }, [draft, onDraftConsumed])

  /**
   * Detecta o token `/algo` imediatamente antes do cursor.
   * Só dispara no começo da linha ou após espaço, para não atrapalhar caminhos
   * de arquivo e URLs que contêm barra.
   */
  function detectSlash(el: HTMLTextAreaElement): { query: string; start: number } | null {
    const pos = el.selectionStart ?? 0
    const before = el.value.slice(0, pos)
    const m = before.match(/(?:^|\s)\/([A-Za-z0-9:_.-]*)$/)
    if (!m) return null
    return { query: m[1], start: pos - m[1].length - 1 }
  }

  function syncSlash() {
    const el = ta.current
    if (!el) return
    const next = detectSlash(el)
    setSlash((prev) => {
      // Reposicionar a seleção só faz sentido quando o texto buscado muda.
      // Resetar a cada tecla anulava a navegação com as setas.
      if (prev?.query !== next?.query) setSlashCursor(0)
      if (prev?.query === next?.query && prev?.start === next?.start) return prev
      return next
    })
  }

  const slashItems = useMemo(() => {
    if (!slash) return []
    const q = slash.query.toLowerCase()
    const scored = commands
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .sort((a, b) => {
        // Quem começa com o que foi digitado vem primeiro.
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.name.localeCompare(b.name)
      })
    return scored.slice(0, 40)
  }, [commands, slash])

  function applyCommand(item: { name: string }) {
    const el = ta.current
    if (!el || !slash) return
    const caret = el.selectionStart ?? value.length
    const next = value.slice(0, slash.start) + '/' + item.name + ' ' + value.slice(caret)
    setValue(next)
    setSlash(null)
    // Cursor logo após o comando inserido.
    const at = slash.start + item.name.length + 2
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(at, at)
    })
  }

  async function submit() {
    const text = value.trim()
    if (!text || !ready) return
    setValue('')
    setAtts([])
    await sendPrompt(text, atts.map((a) => ({ data: a.data, mimeType: a.mimeType })))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Com o menu de comandos aberto, as setas e o Enter pertencem a ele.
    if (slash && slashItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashCursor((i) => (i + 1) % slashItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashCursor((i) => (i - 1 + slashItems.length) % slashItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyCommand(slashItems[slashCursor])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault()
      void submit()
    }
  }

  /** Adiciona imagens vindas de colar ou arrastar. */
  async function addFiles(list: FileList | File[]): Promise<void> {
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    const added = (await Promise.all(files.map(fileToAttachment))).filter(
      (a): a is Attachment => a !== null
    )
    if (added.length > 0) setAtts((prev) => [...prev, ...added])
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const files = e.clipboardData?.files
    if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith('image/'))) {
      // Só intercepta quando há imagem: colar texto continua normal.
      e.preventDefault()
      void addFiles(files)
    }
  }

  async function attach() {
    const r = await window.prime.pickImage()
    if (r?.ok) setAtts((a) => [...a, { path: r.path, data: r.data, mimeType: r.mimeType }])
  }

  return (
    <div className="relative shrink-0 px-6 pb-4 pt-1">
      <div className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-[var(--p-bg)] to-transparent" />

      <ContextChips
        home={home}
        onPickCwd={onPickCwd}
        onToggleFiles={onToggleFiles}
        onSetExecution={onSetExecution}
        connections={connections}
        onOpenSshModal={onOpenSshModal}
        onRemoveConnection={onRemoveConnection}
      />

      {queued > 0 && (
        <div className="mb-2 flex items-center gap-2 text-[11.5px] text-warn">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-warn" />
          {t('composer.queued', { n: queued })}
        </div>
      )}

      {/* Caixa de entrada: o envio fica dentro dela, à direita. */}
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          // `relatedTarget` fora da caixa evita piscar ao cruzar filhos.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return
          e.preventDefault()
          setDragging(false)
          void addFiles(e.dataTransfer.files)
        }}
        className={
          'relative rounded-[12px] border bg-[var(--p-surface)] transition-colors focus-within:border-primary/40 ' +
          (dragging ? 'border-primary/70 bg-primary/[0.06]' : 'border-white/[0.09]')
        }
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[12px] bg-[var(--p-surface)]/80 text-[12.5px] text-primarySoft">
            {t('composer.dropHere')}
          </div>
        )}
        {slash && (
          <SlashMenu
            items={slashItems}
            cursor={slashCursor}
            onPick={applyCommand}
            onHover={setSlashCursor}
          />
        )}
        {/* Anexos dentro da caixa: fazem parte da mensagem que está sendo escrita. */}
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-1 pt-3">
            {atts.map((a, i) => (
              <div key={i} className="group/att relative">
                <img
                  src={`data:${a.mimeType};base64,${a.data}`}
                  alt={a.path}
                  title={a.path}
                  className="h-14 w-14 rounded-lg border border-white/[0.12] object-cover"
                />
                <button
                  onClick={() => setAtts((list) => list.filter((_, j) => j !== i))}
                  title={t('composer.removeAttachment')}
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-white/15 bg-[var(--p-panel)] p-0.5 text-muted opacity-0 transition-opacity hover:text-fg group-hover/att:opacity-100"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={ta}
          rows={1}
          value={value}
          disabled={!ready}
          onChange={(e) => {
            setValue(e.target.value)
            syncSlash()
          }}
          onKeyUp={(e) => {
            // Teclas de navegação pertencem ao menu; não recalculam o token.
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return
            syncSlash()
          }}
          onClick={syncSlash}
          onBlur={() => setSlash(null)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            ready
              ? streaming
                ? t('composer.steerPlaceholder')
                : t('composer.placeholder')
              : t('composer.connecting')
          }
          className={
            'max-h-[260px] w-full resize-none bg-transparent pb-3 pl-3.5 pr-11 text-[14px] leading-relaxed text-fg outline-none placeholder:text-dim disabled:opacity-50 ' +
            (atts.length > 0 ? 'pt-2' : 'pt-3')
          }
        />

        {streaming ? (
          <button
            onClick={() => void abortTurn()}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border border-err/30 bg-err/15 text-err transition-colors hover:bg-err/25"
            title={t('composer.stop')}
          >
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={!value.trim() || !ready}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/[0.07] hover:text-fg disabled:pointer-events-none disabled:opacity-35"
            title={t('composer.send')}
          >
            <CornerDownLeft size={14} />
          </button>
        )}
      </div>

      {/* Controles fora da caixa, como no Claude Code. */}
      <div className="mt-2 flex items-center gap-0.5 px-0.5">
        <button
          onClick={() => void attach()}
          disabled={!ready}
          className="rounded-md p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-muted disabled:opacity-40"
          title={t('composer.attach')}
        >
          <Plus size={15} />
        </button>
        <button
          onClick={onOpenPalette}
          className="rounded-md p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-muted"
          title={t('composer.commands').replace('Ctrl', mod)}
        >
          <Command size={14} />
        </button>

        <div className="flex-1" />

        <ThinkingPicker />
        <ModelPicker />
        <span
          className={
            'ml-1.5 h-2 w-2 rounded-full transition-colors ' +
            (streaming ? 'animate-pulse-soft bg-primary' : ready ? 'bg-ok/70' : 'bg-warn')
          }
          title={streaming ? t('app.running') : ready ? t('app.ready') : t('app.starting')}
        />
      </div>
    </div>
  )
}
