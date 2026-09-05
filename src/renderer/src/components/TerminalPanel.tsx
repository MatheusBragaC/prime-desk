import { useCallback, useEffect, useState } from 'react'
import { X, Plus, SquareTerminal, FileCode2, FolderOpen } from 'lucide-react'
import { useAgent } from '../store/agent'
import { DockPanel } from './DockPanel'
import { TerminalView } from './TerminalView'
import { FileViewer } from './FileViewer'
import { useT } from '../i18n'

/**
 * Painel de terminal e arquivos.
 *
 * Substitui o botão que abria `gnome-terminal` numa janela à parte. Além de
 * shells, as abas aceitam arquivos: o `FileViewer` já era um editor completo
 * (destaque de sintaxe, edição, Ctrl+S), só vivia preso a um overlay de tela
 * cheia. Aqui ele divide o painel com o terminal, que é o arranjo esperado —
 * abrir um arquivo não deveria cobrir a conversa.
 */

interface Tab {
  id: string
  kind: 'shell' | 'file'
  title: string
  /** Caminho relativo à raiz do workspace. Só em abas de arquivo. */
  path?: string
  /** Digitado no shell assim que ele sobe. Só em abas de shell. */
  command?: string
}

let seq = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`

function shellTab(n: number): Tab {
  return { id: nextId('sh'), kind: 'shell', title: `Shell ${n}` }
}

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const cwd = useAgent((s) => s.cwd)
  const notify = useAgent((s) => s.notify)
  const request = useAgent((s) => s.terminalRequest)
  const clearRequest = useAgent((s) => s.clearTerminalRequest)

  const [tabs, setTabs] = useState<Tab[]>(() => [shellTab(1)])
  const [active, setActive] = useState<string>(() => '')

  const activeId = active || tabs[0]?.id || ''

  const addShell = useCallback(() => {
    setTabs((prev) => {
      const n = prev.filter((tb) => tb.kind === 'shell').length + 1
      const tab = shellTab(n)
      setActive(tab.id)
      return [...prev, tab]
    })
  }, [])

  /*
    Pedido vindo de outro canto da UI — hoje só o "trocar de conta", que precisa
    do `/login` interativo do agente. Antes isso abria uma janela do
    gnome-terminal por fora do app.
  */
  useEffect(() => {
    if (!request) return
    setTabs((prev) => {
      /*
        Mesmo comando pedido de novo reusa a aba: pedir "atualizar" duas vezes
        empilhava duas abas idênticas. O shell continua vivo depois que o
        processo termina, então reenviar o comando ali é a repetição natural —
        e o histórico da tentativa anterior fica à vista logo acima.
      */
      const found = prev.find((tb) => tb.kind === 'shell' && tb.command === request.command)
      if (found) {
        setActive(found.id)
        void window.prime.writeTerminal(found.id, request.command + '\r')
        return prev
      }
      const tab: Tab = {
        id: nextId('sh'),
        kind: 'shell',
        title: request.title,
        command: request.command
      }
      setActive(tab.id)
      return [...prev, tab]
    })
    clearRequest()
  }, [request, clearRequest])

  const openFile = useCallback(async () => {
    const r = await window.prime.pickWorkspaceFile()
    if (!r?.ok) {
      if (r?.error) notify('error', r.error)
      return
    }
    const path = r.path as string
    setTabs((prev) => {
      // Reabrir o mesmo arquivo foca a aba existente em vez de duplicar.
      const found = prev.find((tb) => tb.kind === 'file' && tb.path === path)
      if (found) {
        setActive(found.id)
        return prev
      }
      const tab: Tab = {
        id: nextId('file'),
        kind: 'file',
        title: path.split('/').pop() ?? path,
        path
      }
      setActive(tab.id)
      return [...prev, tab]
    })
  }, [notify])

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((tb) => tb.id === id)
      // Fechar a aba encerra o shell: deixá-lo vivo sem superfície only vazaria
      // processo, já que não há como voltar a ele.
      if (tab?.kind === 'shell') void window.prime.killTerminal(id)

      const next = prev.filter((tb) => tb.id !== id)
      if (next.length === 0) {
        onClose()
        return prev
      }
      setActive((cur) => {
        if (cur !== id) return cur
        const wasAt = prev.findIndex((tb) => tb.id === id)
        return (next[wasAt] ?? next[next.length - 1]).id
      })
      return next
    })
  }, [onClose])

  return (
    <DockPanel
      storageKey="terminal"
      defaultWidth={460}
      min={320}
      max={900}
      onClose={onClose}
      bodyClassName="relative min-h-0 flex-1"
      /* Cabeçalho próprio: a tira de abas ocupa o lugar da linha de título. */
      header={
        <div className="drag-region flex h-[var(--p-titlebar)] items-center gap-1 border-b border-[var(--p-line)] pl-2 pr-3">
        <div className="no-drag flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              title={tab.path ?? tab.title}
              className={
                'group flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md pl-2 pr-1 text-xs transition-colors ' +
                (tab.id === activeId
                  ? 'bg-elevated text-fg'
                  : 'text-dim hover:bg-elevated/60 hover:text-muted')
              }
            >
              {tab.kind === 'shell'
                ? <SquareTerminal size={13} strokeWidth={1.75} className="shrink-0" />
                : <FileCode2 size={13} strokeWidth={1.75} className="shrink-0" />}
              <span className="max-w-[120px] truncate">{tab.title}</span>
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
              >
                <X size={11} strokeWidth={2} />
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={addShell}
          className="no-drag shrink-0 rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
          title={t('terminal.newShell')}
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => void openFile()}
          className="no-drag shrink-0 rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
          title={t('terminal.openFile')}
        >
          <FolderOpen size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          className="no-drag shrink-0 rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
        </div>
      }
    >
      {/*
        Todas as abas permanecem montadas, escondidas por CSS. Desmontar um
        TerminalView descartaria o xterm e a tela voltaria vazia ao reabrir —
        o PTY sobrevive, mas o buffer renderizado não.
      */}
      <>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={
              'absolute inset-0 ' + (tab.id === activeId ? 'block' : 'hidden')
            }
          >
            {tab.kind === 'shell' ? (
              <TerminalView id={tab.id} cwd={cwd} command={tab.command} />
            ) : (
              <FileViewer
                path={tab.path as string}
                active={tab.id === activeId}
                onClose={() => closeTab(tab.id)}
              />
            )}
          </div>
        ))}
      </>
    </DockPanel>
  )
}
