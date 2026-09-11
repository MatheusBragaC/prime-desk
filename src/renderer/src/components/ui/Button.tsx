import type { ReactNode } from 'react'
import { Loader2 } from '@/icons'

/**
 * O botão do app.
 *
 * Estava dentro de `components/Modal.tsx`, com quatro variantes e um tamanho,
 * e cobria 8 lugares. Ao lado dele viviam 113 `<button>` crus em 35 arquivos,
 * com 81 combinações de classe — porque o primitivo não cobria as três formas
 * que o app mais usa: só-ícone, linha de menu e barra de ferramentas. Mudou de
 * casa para `ui/` (onde já mora o `InlineEdit`) e ganhou os eixos que faltavam.
 *
 * `Modal.tsx` reexporta, então quem já importava de lá continua importando.
 */

type Variant = 'primary' | 'accent' | 'ghost' | 'outline' | 'danger'
type Size = 'icon' | 'sm' | 'md'

/*
  `primary` é o sólido, e existe um por tela no máximo — hoje só o enviar do
  composer. O tonal, que antes se chamava `primary` e é o que os rodapés de
  modal usam, virou `accent`: chamar de primária uma ação que aparece três
  vezes na mesma caixa esvaziava a palavra.
*/
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-fg hover:bg-primarySoft',
  accent: 'border border-primary/40 bg-primary/20 text-fg hover:bg-primary/30',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  outline: 'border border-lineStrong text-muted hover:border-lineHover hover:text-fg',
  danger: 'border border-err/40 bg-err/15 text-err hover:bg-err/25'
}

const SIZE: Record<Size, string> = {
  icon: 'p-1.5',
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm'
}

/**
 * Linha de menu: largura inteira, texto à esquerda, ícone antes do rótulo.
 *
 * Esta string estava copiada byte a byte em cinco arquivos. É a forma mais
 * repetida do app e a que o primitivo antigo não atendia.
 */
const MENU_ITEM = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors'

/*
  A cor da linha de menu vem da variante, não de `className`.

  Escrita por fora, ela perdia: os chamadores faziam `item + ' text-err'`, e
  como `.text-err` é emitido ANTES de `.text-muted` na folha do Tailwind, o
  cinza ganhava por ordem de origem — "Excluir" e "Sair" apareciam cinza,
  iguais a qualquer outro item. Dentro do primitivo o conflito não existe,
  porque só uma classe de cor entra.
*/
const MENU_TONE: Record<Variant, string> = {
  primary: 'text-fg hover:bg-hover',
  accent: 'text-primarySoft hover:bg-hover hover:text-primarySoft',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  outline: 'text-muted hover:bg-hover hover:text-fg',
  danger: 'text-err hover:bg-hover hover:text-err'
}

/*
  Revelado no ponteiro E no foco.

  O par é indivisível: `opacity-0` sozinho desenha o anel de foco a zero por
  cento, e quem navega por teclado para num botão invisível — foi assim em 14
  botões até a catraca `ghostFocus`. Aqui só o grupo anônimo é suportado: o
  scanner do Tailwind lê classe literal no fonte, então `group-hover/${nome}`
  montado em tempo de execução não geraria CSS nenhum. Grupo nomeado passa as
  classes literais por `className`.
*/
const REVEAL = 'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100'

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  loading = false,
  menuItem = false,
  revealOnHover = false,
  className,
  children,
  disabled,
  ...rest
}: {
  variant?: Variant
  size?: Size
  /** Ícone à esquerda do rótulo, no espaçamento do primitivo. */
  icon?: ReactNode
  /** Troca o ícone por um giro, desabilita e anuncia `aria-busy`. */
  loading?: boolean
  /** Linha de menu em vez de botão solto. Ignora `size`. */
  menuItem?: boolean
  /** Só aparece sob o ponteiro — e sob o foco do teclado. */
  revealOnHover?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = menuItem
    ? MENU_ITEM + ' ' + MENU_TONE[variant]
    : [
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        SIZE[size],
        VARIANT[variant]
      ].join(' ')

  /*
    `className` externo entra DEPOIS da base, e não no lugar dela. Escrito antes
    do spread, qualquer chamador que passasse uma classe apagava o primitivo
    inteiro — e era assim que o botão de perigo e os botões com ícone vinham
    sendo remontados à mão fora daqui.
  */
  const merged = [base, revealOnHover ? REVEAL : '', className].filter(Boolean).join(' ')

  return (
    <button
      className={merged}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 size={14} className="shrink-0 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
