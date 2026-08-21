import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Square, ImagePlus, X, Command } from 'lucide-react'
import { useAgent, sendPrompt, abortTurn } from '../store/agent'
import { ModelPicker, ThinkingPicker } from './ModelPicker'

interface Attachment { path: string; data: string; mimeType: string }

export function Composer({ onOpenPalette }: { onOpenPalette: () => void }) {
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
    <div className="relative shrink-0 px-6 pb-5 pt-1">
      <div className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-[var(--p-bg)] to-transparent" />

      {queued > 0 && (
        <div className="mb-2 flex items-center gap-2 text-[11.5px] text-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse-soft" />
          {queued} mensagem(ns) na fila
        </div>
      )}

      <div className="rounded-[16px] border border-white/[0.09] bg-[var(--p-surface)] shadow-xl shadow-black/40 transition-colors focus-within:border-primary/40">
        {atts.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-white/[0.06] p-2.5">
            {atts.map((a, i) => (
              <div key={i} className="relative">
                <img
                  src={`data:${a.mimeType};base64,${a.data}`}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-white/10 object-cover"
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
                : 'Pergunte ou peça uma tarefa ao Prime…'
              : 'Conectando ao agente…'
          }
          className="max-h-[260px] w-full resize-none bg-transparent px-4 pb-1.5 pt-3.5 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-dim disabled:opacity-50"
        />

        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-0.5">
          <button
            onClick={() => void attach()}
            disabled={!ready}
            className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-muted disabled:opacity-40"
            title="Anexar imagem"
          >
            <ImagePlus size={15} />
          </button>
          <button
            onClick={onOpenPalette}
            className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/[0.06] hover:text-muted"
            title="Paleta de comandos (Ctrl+K)"
          >
            <Command size={15} />
          </button>

          <div className="flex-1" />

          <ThinkingPicker />
          <ModelPicker />

          {streaming ? (
            <button
              onClick={() => void abortTurn()}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-[10px] border border-err/30 bg-err/15 text-err transition-colors hover:bg-err/25"
              title="Interromper (Esc)"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!value.trim() || !ready}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary text-white transition-all hover:bg-primarySoft disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-dim"
              title="Enviar (Enter)"
            >
              <ArrowUp size={15} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-center gap-3 text-[10.5px] text-dim">
        <span><kbd className="font-mono">Enter</kbd> enviar</span>
        <span><kbd className="font-mono">Shift+Enter</kbd> nova linha</span>
        <span><kbd className="font-mono">Ctrl+K</kbd> comandos</span>
      </div>
    </div>
  )
}
