import { useEffect, useRef, useState } from 'react'
import {
  Square, X, Command, Folder, GitBranch, Monitor, FolderTree, Plus, CornerDownLeft,
  FolderOpen, Check, Terminal, Trash2
} from 'lucide-react'
import { useAgent, sendPrompt, abortTurn } from '../store/agent'
import { ModelPicker, ThinkingPicker } from './ModelPicker'

export interface SshConnection {
  id: string
  name: string
  host: string
  port?: number
  identity?: string
  remotePath?: string
}

interface Attachment { path: string; data: string; mimeType: string }

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
        <span className="flex-1">Local</span>
        {execution.kind === 'local' && <Check size={12} className="text-primarySoft" />}
      </button>

      {connections.length > 0 && (
        <>
          <div className="mt-1 px-2 py-1 text-[10px] uppercase tracking-wider text-dim">
            Conexões SSH
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
                  title="Remover conexão"
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
          Adicionar conexão SSH
        </button>
      </div>

      <div className="px-2 pb-1 pt-1 text-[10.5px] leading-snug text-dim">
        O prime-agent executa localmente ou por SSH. Não há modo em nuvem.
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
          title="Onde o agente executa"
        >
          {execution.kind === 'ssh' ? <Terminal size={11} /> : <Monitor size={11} />}
          {execution.kind === 'ssh' ? (execution.target ?? 'SSH') : 'Local'}
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
        <span className={chip + ' text-muted'} title="Branch atual">
          <GitBranch size={11} className="text-dim" />
          <span className="max-w-[180px] truncate">{branch}</span>
        </span>
      )}

      <button
        onClick={onToggleFiles}
        className={chip + ' text-muted hover:border-primary/40 hover:text-fg'}
        title="Explorador de arquivos (Ctrl+Shift+F)"
      >
        <FolderTree size={11} />
        Arquivos
      </button>

      <button
        onClick={onPickCwd}
        className="flex items-center justify-center rounded-lg border border-white/[0.08] bg-[var(--p-surface)] px-2 py-1 text-dim transition-colors hover:border-primary/40 hover:text-fg"
        title="Escolher outro diretório de trabalho"
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
  const [value, setValue] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])
  const ta = useRef<HTMLTextAreaElement>(null)
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

  async function submit() {
    const text = value.trim()
    if (!text || !ready) return
    setValue('')
    setAtts([])
    await sendPrompt(text, atts.map((a) => ({ data: a.data, mimeType: a.mimeType })))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault()
      void submit()
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
          {queued} mensagem(ns) na fila
        </div>
      )}

      {atts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {atts.map((a, i) => (
            <div key={i} className="relative">
              <img
                src={`data:${a.mimeType};base64,${a.data}`}
                alt=""
                className="h-14 w-14 rounded-lg border border-white/10 object-cover"
              />
              <button
                onClick={() => setAtts((list) => list.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-white/15 bg-panel p-0.5 text-muted hover:text-fg"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Caixa de entrada: o envio fica dentro dela, à direita. */}
      <div className="relative rounded-[12px] border border-white/[0.09] bg-[var(--p-surface)] transition-colors focus-within:border-primary/40">
        <textarea
          ref={ta}
          rows={1}
          value={value}
          disabled={!ready}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            ready
              ? streaming
                ? 'Interromper com uma nova instrução (steer)…'
                : 'Descreva uma tarefa ou faça uma pergunta'
              : 'Conectando ao agente…'
          }
          className="max-h-[260px] w-full resize-none bg-transparent py-3 pl-3.5 pr-11 text-[14px] leading-relaxed text-fg outline-none placeholder:text-dim disabled:opacity-50"
        />

        {streaming ? (
          <button
            onClick={() => void abortTurn()}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border border-err/30 bg-err/15 text-err transition-colors hover:bg-err/25"
            title="Interromper (Esc)"
          >
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={!value.trim() || !ready}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/[0.07] hover:text-fg disabled:pointer-events-none disabled:opacity-35"
            title="Enviar (Enter)"
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
          title="Anexar imagem"
        >
          <Plus size={15} />
        </button>
        <button
          onClick={onOpenPalette}
          className="rounded-md p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-muted"
          title="Comandos e skills (Ctrl+K)"
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
          title={streaming ? 'Executando' : ready ? 'Pronto' : 'Conectando'}
        />
      </div>
    </div>
  )
}
