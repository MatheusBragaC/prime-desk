import { AgentTree } from './AgentTree'
import { FilesPanel } from './FilesPanel'
import { DiffPanel } from './DiffPanel'
import { TerminalPanel } from './TerminalPanel'
import { SchedulesPanel } from './SchedulesPanel'
import { DocumentPanel } from './DocumentPanel'
import type { Dock } from './StatusBar'

/**
 * Escolhe o painel do dock.
 *
 * Slot único, então isto é um `switch` e não uma pilha: montar dois painéis ao
 * mesmo tempo espremia a conversa até o composer ficar inutilizável.
 *
 * Nenhum painel fica montado escondido — cada um custa polling ou processo
 * (o terminal tem PTY, o de arquivos lista diretório), e manter isso vivo fora
 * da tela era gasto sem ninguém olhando. O TerminalPanel preserva as abas
 * internamente; ver o comentário lá.
 */

export interface DockHostProps {
  dock: Dock
  onClose: () => void
  onOpenFile: (path: string) => void
  onQuoteFile: (path: string) => void
}

export function DockHost({ dock, onClose, onOpenFile, onQuoteFile }: DockHostProps) {
  switch (dock) {
    case 'files':
      return <FilesPanel onClose={onClose} onOpenFile={onOpenFile} onQuote={onQuoteFile} />
    case 'diff':
      return <DiffPanel onClose={onClose} />
    case 'terminal':
      return <TerminalPanel onClose={onClose} />
    case 'schedules':
      return <SchedulesPanel onClose={onClose} />
    case 'agents':
      return <AgentTree onClose={onClose} />
    case 'document':
      return <DocumentPanel onClose={onClose} />
    default:
      return null
  }
}
