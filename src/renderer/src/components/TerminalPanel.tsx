import { useCallback, useEffect } from 'react'
import { X, Plus, SquareTerminal, FileCode2, FolderOpen } from 'lucide-react'
import { useAgent } from '../store/agent'
import { useTerminalTabs } from '../store/terminal'
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
 *
 * As abas ficam em `store/terminal.ts`: este componente é desmontado toda vez
 * que o dock fecha, e o PTY não pode depender de estado que morre junto.
 */

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const cwd = useAgent((s) => s.cwd)
  const notify = useAgent((s) => s.notify)
  const request = useAgent((s) => s.terminalRequest)
  const clearRequest = useAgent((s) => s.clearTerminalRequest)

  const tabs = useTerminalTabs((s) => s.tabs)
  const activeId = useTerminalTabs((s) => s.activeId)
  const setActive = useTerminalTabs((s) => s.setActive)
  const addShell = useTerminalTabs((s) => s.addShell)
  const ensureShell = useTerminalTabs((s) => s.ensureShell)

  // Painel aberto sem nenhuma aba (primeira abertura, ou depois de fechar a
  // última) começa com um shell, como antes.
  useEffect(() => {
    ensureShell()
  }, [ensureShell])

  /*
    Pedido vindo de outro canto da UI — hoje só o "trocar de conta", que precisa
    do `/login` interativo do agente. Antes isso abria uma janela do
    gnome-terminal por fora do app.
  */
  useEffect(() => {
    if (!request) return
    useTerminalTabs.getState().runCommand(request.command, request.title)
    clearRequest()
  }, [request, clearRequest])

  const openFile = useCallback(async () => {
    const r = await window.prime.pickWorkspaceFile()
    if (!r?.ok) {
      if (r?.error) notify('error', r.error)
      return
    }
    useTerminalTabs.getState().openFile(r.path)
  }, [notify])

  // Fechar a última aba fecha o dock: painel de abas vazio não tem o que
  // mostrar. O `ensureShell` da montagem repõe o shell na próxima abertura.
  const closeTab = useCallback((id: string) => {
    if (useTerminalTabs.getState().closeTab(id) === 0) onClose()
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
          {/*
            Aba e fechar são irmãos dentro de um `div` de layout. Antes o fechar
            era um `<span role="button" tabIndex={-1}>` DENTRO do botão da aba:
            aninhamento interativo é HTML inválido, o leitor de tela anuncia um
            controle ambíguo e o `tabIndex={-1}` tirava o fechar do teclado. O
            `stopPropagation` deixou de ser necessário porque não há mais
            handler no pai.
          */}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={
                'group flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-md pl-2 pr-1 text-xs transition-colors ' +
                (tab.id === activeId
                  ? 'bg-elevated text-fg'
                  : 'text-dim hover:bg-elevated/60 hover:text-muted')
              }
            >
              <button
                onClick={() => setActive(tab.id)}
                title={tab.path ?? tab.title}
                className="flex min-w-0 items-center gap-1.5 text-left"
              >
                {tab.kind === 'shell'
                  ? <SquareTerminal size={13} strokeWidth={1.75} className="shrink-0" />
                  : <FileCode2 size={13} strokeWidth={1.75} className="shrink-0" />}
                <span className="max-w-[120px] truncate">{tab.title}</span>
              </button>
              {/* `focus-visible` porque o fechar só aparece no hover: sem isso, quem navega por teclado foca um botão invisível. */}
              <button
                onClick={() => closeTab(tab.id)}
                aria-label={t('terminal.closeTab')}
                className="rounded p-0.5 text-dim opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addShell}
          className="no-drag shrink-0 rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
          title={t('terminal.newShell')}
          aria-label={t('terminal.newShell')}
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => void openFile()}
          className="no-drag shrink-0 rounded-md p-1 text-dim transition-colors hover:bg-elevated hover:text-fg"
          title={t('terminal.openFile')}
          aria-label={t('terminal.openFile')}
        >
          <FolderOpen size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
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
