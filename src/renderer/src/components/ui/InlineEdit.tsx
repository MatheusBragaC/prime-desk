import { useRef, useState } from 'react'

/**
 * Campo de edição inline: autofoco, confirma no blur e no `Enter`, cancela no
 * `Escape`.
 *
 * A sidebar tinha três cópias do mesmo `input` (renomear conversa, renomear
 * pasta, nomear pasta nova) e as três repetiam o par blur/tecla à mão — cada
 * cópia com uma chance de esquecer uma das duas saídas. Aqui o ciclo de
 * commit/cancel é um só; o que muda entre os usos é a caixa.
 */

/*
  Três geometrias porque são três lugares diferentes na hierarquia visual, não
  por gosto: o cabeçalho de grupo divide a linha com o chevron e os botões de
  hover (`flex-1`, `text-xs`), a linha de conversa ocupa a linha inteira na
  altura do título, e a pasta nova é uma caixa própria, mais alta. As classes
  são as que já estavam em cada ponto de uso.
*/
const SIZE = {
  sm: 'min-w-0 flex-1 border-primary/40 px-1 text-xs',
  md: 'w-full border-primary/45 px-1.5 py-0.5 text-sm',
  lg: 'w-full border-primary/45 px-2 py-1 text-sm'
} as const

export function InlineEdit({
  value = '',
  placeholder,
  size = 'md',
  onCommit,
  onCancel
}: {
  /** Valor inicial. O rascunho vive aqui dentro e morre com o desmonte. */
  value?: string
  placeholder?: string
  size?: keyof typeof SIZE
  /** Recebe o valor já aparado. */
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  /*
    Confirmar (ou cancelar) desmonta o campo, porque quem decide se ele existe é
    o estado do pai. Sem a trava, o blur do desmonte disparava a segunda
    chamada: inofensivo ao renomear, mas em "nova pasta" criava duas pastas.
  */
  const settled = useRef(false)

  function commit(next: string): void {
    if (settled.current) return
    settled.current = true
    onCommit(next.trim())
  }

  function cancel(): void {
    if (settled.current) return
    settled.current = true
    onCancel()
  }

  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value)
        if (e.key === 'Escape') cancel()
      }}
      className={
        'rounded border bg-well text-fg outline-none placeholder:text-dim ' + SIZE[size]
      }
    />
  )
}
