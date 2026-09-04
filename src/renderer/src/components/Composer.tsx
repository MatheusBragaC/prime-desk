import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  Square, X, Command, Folder, GitBranch, Monitor, Plus, ArrowUp, FileText,
  Check, Terminal, Trash2
} from 'lucide-react'
import { useAgent, sendPrompt, abortTurn } from '../store/agent'
import { ModelPicker, ThinkingPicker } from './ModelPicker'
import { SlashMenu } from './SlashMenu'
import { useMod } from '../lib/platform'
import { joinWithPaths, baseName } from '../lib/attachments'
import { usePopover } from '../lib/usePopover'
import { useT } from '../i18n'

export interface SshConnection {
  id: string
  name: string
  host: string
  port?: number
  identity?: string
  remotePath?: string
}

/**
 * Anexo pendente na caixa de entrada.
 *
 * `image` sobe em base64 no campo `images` do prompt. `file` não sobe: o RPC do
 * prime-agent só transporta imagem, então o caminho é acrescentado ao texto e
 * quem lê o arquivo é o agente. Os dois aparecem como chip na caixa.
 */
type Attachment =
  | { kind: 'image'; path: string; data: string; mimeType: string }
  | { kind: 'file'; path: string }

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
        kind: 'image',
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
  onClose,
  trigger
}: {
  execution: { kind: 'local' | 'ssh'; target?: string }
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

/** Barra de contexto: onde o agente está executando. */
function ContextChips({
  home,
  onPickCwd,
  onSetExecution,
  connections,
  onOpenSshModal,
  onRemoveConnection
}: {
  home: string
  onPickCwd: () => void
  onSetExecution: (conn: SshConnection | null) => void
  connections: SshConnection[]
  onOpenSshModal: () => void
  onRemoveConnection: (id: string) => void
}) {
  const { t } = useT()
  const cwd = useAgent((s) => s.cwd)
  const [branch, setBranch] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const execBtn = useRef<HTMLButtonElement>(null)
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

  /*
    Contexto é informação de apoio, não comando: sai da forma de pílula com
    borda — que competia com o composer logo abaixo — e vira uma linha de texto
    fraca. O affordance de clique aparece no hover.
  */
  const chip =
    'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-dim transition-colors hover:bg-elevated hover:text-muted'

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-0.5 px-1">
      <div className="relative">
        <button
          ref={execBtn}
          onClick={() => setMenu((v) => !v)}
          className={chip}
          title={t('chips.execTitle')}
        >
          {execution.kind === 'ssh' ? <Terminal size={14} strokeWidth={1.75} /> : <Monitor size={14} strokeWidth={1.75} />}
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
            trigger={execBtn}
          />
        )}
      </div>

      <span className="select-none text-xs text-grid">·</span>

      <button onClick={onPickCwd} className={chip} title={cwd || t('chips.pickDir')}>
        <Folder size={14} strokeWidth={1.75} />
        {short}
      </button>

      {branch && (
        <>
          <span className="select-none text-xs text-grid">·</span>
          <span className={chip.replace('hover:bg-elevated hover:text-muted', '')} title={t('chips.branch')}>
            <GitBranch size={14} strokeWidth={1.75} />
            <span className="max-w-[180px] truncate">{branch}</span>
          </span>
        </>
      )}

    </div>
  )
}

export function Composer({
  onOpenPalette,
  onPickCwd,
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
    const files = atts.filter((a) => a.kind === 'file')
    const images = atts.filter((a) => a.kind === 'image')
    // Com anexo de arquivo, o caminho basta: a mensagem pode vir só com ele.
    const text = joinWithPaths(value, files.map((f) => f.path))
    if (!text || !ready) return
    setValue('')
    setAtts([])
    await sendPrompt(text, images.map((a) => ({ data: a.data, mimeType: a.mimeType })))
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
  /**
   * Arquivos arrastados ou colados.
   *
   * Imagem sobe em base64. Qualquer outra coisa — PDF, planilha, código — entra
   * como anexo de caminho: o chip aparece igual, e o caminho só se junta ao
   * texto no envio.
   */
  async function addFiles(list: FileList | File[]): Promise<void> {
    const all = Array.from(list)
    const images = all.filter((f) => f.type.startsWith('image/'))
    const others = all.filter((f) => !f.type.startsWith('image/'))

    if (images.length > 0) {
      const added = (await Promise.all(images.map(fileToAttachment))).filter(
        (a): a is Attachment => a !== null
      )
      if (added.length > 0) setAtts((prev) => [...prev, ...added])
    }

    if (others.length > 0) {
      // `File.path` não existe com o renderer em sandbox; o preload resolve.
      const paths = others.map((f) => window.prime.pathForFile(f)).filter(Boolean)
      if (paths.length > 0) {
        setAtts((prev) => [...prev, ...paths.map((path) => ({ kind: 'file' as const, path }))])
      }
      if (paths.length < others.length) {
        useAgent.getState().notify('info', t('composer.noPath'))
      }
    }
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
    const r = await window.prime.pickAttachment()
    if (!r?.ok) return
    const picked = r.picked as { path: string; isImage: boolean; data?: string; mimeType?: string }[]

    setAtts((a) => [
      ...a,
      ...picked.map((p): Attachment =>
        p.isImage
          ? { kind: 'image', path: p.path, data: p.data!, mimeType: p.mimeType! }
          : { kind: 'file', path: p.path }
      )
    ])
  }

  return (
    <div className="relative shrink-0 px-6 pb-4 pt-1">
      <div className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-[var(--p-bg)] to-transparent" />

      <ContextChips
        home={home}
        onPickCwd={onPickCwd}
        onSetExecution={onSetExecution}
        connections={connections}
        onOpenSshModal={onOpenSshModal}
        onRemoveConnection={onRemoveConnection}
      />

      {queued > 0 && (
        <div className="mb-2 flex items-center gap-2 px-1 text-xs text-warn">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-warn" />
          {t('composer.queued', { n: queued })}
        </div>
      )}

      {/* Caixa de entrada: texto, anexos e todos os controles moram dentro dela. */}
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
          'relative rounded-composer border bg-[var(--p-surface)] transition-colors focus-within:border-primary/45 ' +
          (dragging ? 'border-primary/70 bg-primary/[0.06]' : 'border-[var(--p-line)]')
        }
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-composer bg-[var(--p-surface)]/80 text-sm text-primarySoft">
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
          <div className="flex flex-wrap gap-2 px-4 pb-1 pt-4">
            {atts.map((a, i) => (
              <div key={i} className="group/att relative">
                {a.kind === 'image' ? (
                  <img
                    src={`data:${a.mimeType};base64,${a.data}`}
                    alt={a.path}
                    title={a.path}
                    className="h-14 w-14 rounded-card border border-white/[0.12] object-cover"
                  />
                ) : (
                  /* Arquivo não tem miniatura: o chip mostra nome e tipo. */
                  <div
                    title={a.path}
                    className="flex h-14 max-w-[220px] items-center gap-2 rounded-card border border-white/[0.12] bg-[var(--p-panel)] px-3"
                  >
                    <FileText size={18} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{baseName(a.path)}</span>
                      <span className="block truncate text-micro uppercase tracking-wider text-dim">
                        {baseName(a.path).split('.').pop()}
                      </span>
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setAtts((list) => list.filter((_, j) => j !== i))}
                  title={t('composer.removeAttachment')}
                  className="absolute -right-1.5 -top-1.5 rounded-full border border-white/15 bg-[var(--p-panel)] p-0.5 text-muted opacity-0 transition-opacity hover:text-fg group-hover/att:opacity-100"
                >
                  <X size={14} strokeWidth={1.75} />
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
            'max-h-[260px] w-full resize-none bg-transparent px-4 pb-1 text-base text-fg outline-none placeholder:text-dim disabled:opacity-50 ' +
            (atts.length > 0 ? 'pt-2' : 'pt-4')
          }
        />

        {/*
          Barra de controles DENTRO da caixa. Fora dela, como estava, ela lia
          como uma segunda barra de ferramentas do app; dentro, pertence
          visivelmente à mensagem que está sendo escrita.
        */}
        <div className="flex items-center gap-0.5 px-2.5 pb-2.5 pt-1">
          <button
            onClick={() => void attach()}
            disabled={!ready}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-elevated hover:text-muted disabled:opacity-40"
            title={t('composer.attach')}
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={onOpenPalette}
            className="rounded-md p-1.5 text-dim transition-colors hover:bg-elevated hover:text-muted"
            title={t('composer.commands').replace('Ctrl', mod)}
          >
            <Command size={16} strokeWidth={1.75} />
          </button>

          <div className="flex-1" />

          <ThinkingPicker />
          <ModelPicker />

          {streaming ? (
            <button
              onClick={() => void abortTurn()}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-fg transition-colors hover:bg-white/20"
              title={t('composer.stop')}
            >
              <Square size={14} strokeWidth={1.75} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!value.trim() || !ready}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primarySoft disabled:bg-elevated disabled:text-dim"
              title={t('composer.send')}
            >
              <ArrowUp size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
