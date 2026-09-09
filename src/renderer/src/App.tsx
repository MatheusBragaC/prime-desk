import { useCallback, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Composer } from './components/Composer'
import { ContextChips } from './components/composer/ContextChips'
import { CommandPalette } from './components/CommandPalette'
import { ObservedPanel } from './components/ObservedPanel'
import { Notice } from './components/Notice'
import { SshModal } from './components/SshModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Onboarding } from './components/Onboarding'
import { FileViewer } from './components/FileViewer'
import { Transcript } from './components/Transcript'
import { StalledTurnNotice } from './components/StalledTurnNotice'
import { DockHost } from './components/DockHost'
import { useBridge } from './lib/useBridge'
import { useWindowChrome } from './lib/useWindowChrome'
import { useDock } from './lib/useDock'
import { useZoom } from './lib/useZoom'
import { useAppShortcuts } from './lib/useAppShortcuts'
import { useStickyScroll } from './lib/useStickyScroll'
import { useMessageWindow } from './lib/useMessageWindow'
import { useExecutionTarget } from './lib/useExecutionTarget'
import { awaitingFirstBlock } from './lib/pending'
import { useAgent } from './store/agent'

/**
 * A janela: compõe os pedaços e decide o layout. Nada de lógica própria.
 *
 * Cada comportamento mora no seu hook — ponte, dock, zoom, atalhos, rolagem,
 * paginação, destino de execução. Aqui ficam só as decisões que precisam de
 * mais de um deles ao mesmo tempo.
 *
 * Os modais ficam neste nível de propósito, o mais estável da árvore: um
 * diálogo não deve depender do ciclo de vida de um chip da barra de contexto,
 * que desmonta quando o painel lateral abre.
 */

export function App() {
  const chrome = useWindowChrome()
  const exec = useExecutionTarget()
  const { needsSetup, setNeedsSetup, home } = useBridge(exec.load)

  const messages = useAgent((s) => s.messages)
  const tools = useAgent((s) => s.tools)
  const fatal = useAgent((s) => s.fatal)
  const streaming = useAgent((s) => s.state?.isStreaming ?? false)
  const loadingSession = useAgent((s) => s.loadingSession)
  const sessionId = useAgent((s) => s.state?.sessionId)
  const observed = useAgent((s) => s.observed)

  const dock = useDock(chrome.narrowDock, streaming)
  const zoom = useZoom()

  const [palette, setPalette] = useState(false)
  const [sshModal, setSshModal] = useState(false)
  const [openFile, setOpenFile] = useState<string | null>(null)
  /** Caminho que o painel de arquivos mandou para o composer citar. */
  const [fileDraft, setFileDraft] = useState<string | undefined>()

  const openPalette = useCallback(() => setPalette((v) => !v), [])
  useAppShortcuts({ onPalette: openPalette, onDock: dock.toggle, zoom })

  const msgWindow = useMessageWindow(messages, sessionId, loadingSession)
  const scroll = useStickyScroll({
    sessionId,
    loadingSession,
    messageCount: messages.length,
    sticksOn: [messages, tools]
  })

  /** Conversa sem conteúdo: a tela inicial troca o layout do palco. */
  const isEmpty = !loadingSession && !fatal && messages.length === 0

  if (needsSetup) {
    return (
      <Onboarding
        onReady={() => {
          setNeedsSetup(false)
          // Recarrega para refazer o boot completo com o ambiente já pronto.
          window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--p-bg)]">
      {chrome.narrowSidebar && chrome.sidebarOpen && (
        <div
          className="fixed inset-0 z-scrim bg-black/50 animate-fade-up"
          onClick={() => chrome.setSidebarOpen(false)}
        />
      )}

      <div
        className={
          chrome.narrowSidebar
            ? 'fixed inset-y-0 left-0 z-panel transition-transform duration-200 ' +
              (chrome.sidebarOpen ? 'translate-x-0 shadow-2xl shadow-black/60' : '-translate-x-full')
            : 'contents'
        }
      >
        <Sidebar
          onSignedOut={() => setNeedsSetup(true)}
          home={home}
          onNavigate={() => chrome.narrowSidebar && chrome.setSidebarOpen(false)}
        />
      </div>

      <main className="relative flex min-w-[420px] flex-1 flex-col">
        <div className="aurora pointer-events-none absolute inset-0" />
        <StatusBar
          onToggleSidebar={
            chrome.narrowSidebar ? () => chrome.setSidebarOpen((v) => !v) : undefined
          }
          dock={dock.dock}
          onDock={dock.toggle}
        />
        <Notice />

        {/*
          Conversa vazia: a saudação e o composer formam um grupo só, centrado na
          área útil — é assim no Claude Desktop. Com conteúdo, o rolador volta a
          ocupar tudo e o composer se fixa no rodapé.
        */}
        <div
          className={
            'relative z-10 flex min-h-0 flex-1 flex-col ' + (isEmpty ? 'justify-center' : '')
          }
        >
          <Transcript
            fatal={fatal}
            loadingSession={loadingSession}
            isEmpty={isEmpty}
            messages={msgWindow.visible}
            tools={tools}
            hidden={msgWindow.hidden}
            onLoadOlder={msgWindow.loadOlder}
            showPending={awaitingFirstBlock(messages, streaming)}
            scrollRef={scroll.ref}
            onScroll={scroll.onScroll}
          />

          <div className="relative z-10 mx-auto w-full max-w-col">
            <StalledTurnNotice />
            {/*
              Os chips ficam aqui, e não dentro do `Composer`: as ações deles são
              do destino de execução, que é deste nível (`useExecutionTarget` e o
              modal de SSH). O composer só repassava seis props que não usava.
            */}
            <div className="relative shrink-0 px-6 pt-1">
              <div className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-t from-[var(--p-bg)] to-transparent" />
              <ContextChips
                home={home}
                onPickCwd={() => void exec.pickDirectory()}
                onSetExecution={(conn) => void exec.use(conn)}
                connections={exec.connections}
                onOpenSshModal={() => setSshModal(true)}
                onRemoveConnection={(id) => void exec.remove(id)}
              />
            </div>
            <Composer
              onOpenPalette={() => setPalette(true)}
              draft={fileDraft}
              onDraftConsumed={() => setFileDraft(undefined)}
            />
          </div>
        </div>

        {/* Última sessão observada fica em foco; as outras seguem acumulando em background. */}
        {Object.keys(observed).length > 0 && <ObservedPanel />}

        {openFile && <FileViewer path={openFile} onClose={() => setOpenFile(null)} />}
      </main>

      <DockHost
        dock={dock.dock}
        onClose={dock.close}
        onOpenFile={setOpenFile}
        onQuoteFile={setFileDraft}
      />

      <CommandPalette open={palette} onClose={() => setPalette(false)} />

      <SshModal
        open={sshModal}
        onClose={() => setSshModal(false)}
        onSubmit={(form) => {
          setSshModal(false)
          void exec.add(form)
        }}
      />

      <ConfirmDialog />
    </div>
  )
}
