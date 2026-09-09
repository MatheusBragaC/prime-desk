import { useRef, useState } from 'react'
import { Folder, Monitor, Terminal } from 'lucide-react'
import { useAgent } from '../../store/agent'
import { BranchPicker } from '../BranchPicker'
import { ExecutionMenu } from './ExecutionMenu'
import type { SshConnection } from '../../../../shared/protocol'
import { useT } from '../../i18n'

/** Barra de contexto: onde o agente está executando. */
export function ContextChips({
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
  /*
    Só observa. Antes o destino era lido por IPC num efeito com dependência
    `[cwd]`: trocar de máquina sem trocar de diretório deixava o chip no valor
    antigo. Quem escreve é o start da ponte, em `lib/useBridge.ts`.
  */
  const execution = useAgent((s) => s.execution)
  const [menu, setMenu] = useState(false)
  const execBtn = useRef<HTMLButtonElement>(null)

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

      <BranchPicker chipClass={chip} />

    </div>
  )
}
