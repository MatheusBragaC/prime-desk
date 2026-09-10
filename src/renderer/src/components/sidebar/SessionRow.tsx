import { useRef, useState } from 'react'
import { MoreHorizontal, Pin } from 'lucide-react'
import { useAgent, mutateFolders } from '@/store/agent'
import type { Group } from '@/lib/grouping'
import { SessionMenu } from '@/components/SessionMenu'
import { InlineEdit } from '@/components/ui/InlineEdit'
import type { SessionSummary } from '@shared/protocol'
import { useT } from '@/i18n'

export function SessionRow({
  s,
  active,
  busy,
  inUse,
  running,
  onOpen,
  groups
}: {
  s: SessionSummary
  active: boolean
  busy: boolean
  inUse: boolean
  /** Turno desta conversa seguindo numa ponte estacionada. */
  running: boolean
  onOpen: () => void
  groups: Group[]
}) {
  const { t } = useT()
  const [menu, setMenu] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const [renaming, setRenaming] = useState(false)
  const folders = useAgent((st) => st.folders)
  const pinned = Boolean(folders.pinned?.[s.id])

  async function commitRename(name: string) {
    setRenaming(false)
    await mutateFolders((st) => {
      const titles = { ...(st.titles ?? {}) }
      if (!name) delete titles[s.id]
      else titles[s.id] = name
      return { ...st, titles }
    })
  }

  if (renaming) {
    return (
      <div className="mb-px px-3 py-[5px]">
        <InlineEdit
          value={s.title}
          onCommit={(name) => void commitRename(name)}
          onCancel={() => setRenaming(false)}
        />
      </div>
    )
  }

  return (
    <div className="group relative">
      <button
        disabled={busy}
        onClick={onOpen}
        className={
          'mb-px flex h-8 w-full items-center gap-2 rounded-md pl-2 pr-2 text-left transition-colors disabled:opacity-50 ' +
          (active
            ? 'bg-[var(--p-selected)] text-fg'
            : 'text-fg/80 hover:bg-elevated hover:text-fg')
        }
        title={s.title}
      >
        {/*
          Trilho de marcador com largura fixa, em toda linha.

          Antes o marcador só existia quando havia status (fixada, rodando,
          carregada por outro worker), e a linha sem status não tinha nada: o
          início do texto pulava alguns pixels conforme o estado, e a lista lia
          como um bloco de texto solto, sem eixo. Agora o slot é sempre o mesmo
          e o que muda é o glifo dentro dele — é assim que a sidebar do Claude
          se mantém alinhada.

          O ponto vazado é o estado normal. Ele não informa nada: existe para
          dar coluna à lista e para o status ter onde aparecer sem empurrar
          ninguém.
        */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {running ? (
            <span
              title={t('session.runningElsewhere')}
              className="h-[6px] w-[6px] animate-pulse-soft rounded-full bg-primary"
            />
          ) : pinned ? (
            <Pin size={13} strokeWidth={1.75} className="text-primarySoft" />
          ) : inUse ? (
            <span
              title={t('session.inUse')}
              className="h-[5px] w-[5px] rounded-full border border-warn bg-warn/40"
            />
          ) : (
            <span
              className={
                'h-[5px] w-[5px] rounded-full border transition-colors ' +
                (active ? 'border-primarySoft bg-primarySoft/40' : 'border-grid')
              }
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm leading-snug">{s.title}</span>
      </button>

      {/*
        O botão de ações flutua sobre o fim do texto em vez de ter coluna
        própria. Antes a linha reservava 28px de `padding-right` para ele o
        tempo todo, e o título cortava quatro caracteres antes do necessário em
        TODA conversa — para um botão que só aparece no hover. O esmaecimento
        abaixo evita que o texto passe por baixo do ícone.
      */}
      <span
        className={
          'pointer-events-none absolute right-0 top-0 h-8 w-11 rounded-r-md bg-gradient-to-l to-transparent transition-opacity ' +
          (active ? 'from-[var(--p-selected)] via-[var(--p-selected)]' : 'from-elevated via-elevated') +
          (menu ? ' opacity-100' : ' opacity-0 group-hover:opacity-100')
        }
      />

      <button
        ref={menuBtn}
        onClick={(e) => {
          e.stopPropagation()
          setMenu((v) => !v)
        }}
        className={
          'absolute right-1 top-1.5 rounded p-0.5 transition-opacity hover:text-fg ' +
          (menu ? 'text-fg opacity-100' : 'text-dim opacity-0 group-hover:opacity-100')
        }
        title={t('menu.actions')}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>

      {menu && (
        <SessionMenu
          session={s}
          groups={groups}
          isActive={active}
          onClose={() => setMenu(false)}
          trigger={menuBtn}
          onOpen={() => {
            setMenu(false)
            onOpen()
          }}
          onRename={() => {
            setMenu(false)
            setRenaming(true)
          }}
        />
      )}
    </div>
  )
}
