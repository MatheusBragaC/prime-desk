import {
  AlertTriangle,
  Check,
  CheckCircle2,
  GitBranch,
  Network,
  SquareTerminal,
  Terminal,
  X,
  type LucideIcon
} from 'lucide-react'

/**
 * Ícones por PAPEL, não por desenho.
 *
 * O app importa 81 ícones do lucide direto em 39 arquivos, e a disciplina de
 * traço é boa — 1,75 em 209 de 213 usos. O que faltava era significado: quatro
 * glifos serviam a dois papéis cada, e o pior deles é o `X`, que fechava modal
 * em 10 lugares e marcava ferramenta com erro num décimo primeiro. Fechar é
 * ação; falhar é estado, e o glifo que o usuário aprendeu a clicar para
 * dispensar não pode ser o mesmo que anuncia que algo deu errado.
 *
 * Este módulo não envolve os 215 usos: envolver todos seria um diff enorme com
 * ganho pequeno, porque `size` tem 12 valores distintos legítimos e 31 arquivos
 * passam `className` no ícone. Aqui moram só os papéis onde o significado
 * estava ambíguo, mais o tamanho canônico de cada um.
 */

/** Tamanhos canônicos: metadado dentro de linha, padrão, cabeçalho. */
const META = 12
const PADRAO = 14
const CROMO = 16

/*
  `aria-hidden` por padrão: estes desenhos acompanham um rótulo — o texto ao
  lado, ou o `aria-label` do botão que os contém. Quando o ícone for a única
  informação, quem chama passa `aria-hidden={false}` e um `aria-label` próprio.
*/
function papel(Glifo: LucideIcon, padrao: number) {
  return function Icone({
    size = padrao,
    className,
    ...rest
  }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) {
    return (
      <Glifo size={size} strokeWidth={1.75} className={className} aria-hidden {...rest} />
    )
  }
}

/** Dispensar: modal, aba, anexo, aviso. Nunca falha. */
export const IconClose = papel(X, CROMO)

/** Falhou: ferramenta, passo, conexão. Nunca dispensa. */
export const IconFailed = papel(AlertTriangle, PADRAO)

/**
 * Concluiu — ESTADO, com círculo.
 *
 * O par com `IconConfirm` é a segunda colisão: o check solto marcava tanto
 * "ferramenta terminou bem" quanto "copiado". Círculo para estado que persiste,
 * traço solto para confirmação que passa.
 */
export const IconDone = papel(CheckCircle2, PADRAO)

/** Confirmação passageira ou item escolhido: copiado, salvo, selecionado. */
export const IconConfirm = papel(Check, PADRAO)

/**
 * Agentes.
 *
 * `GitBranch` servia a isto e a branch de verdade ao mesmo tempo, em cinco
 * lugares. A hierarquia de três caixas diz o que a árvore de agentes é; a
 * ramificação fica com quem fala de git.
 */
export const IconAgents = papel(Network, CROMO)

/** Branch do git, e só. */
export const IconBranch = papel(GitBranch, PADRAO)

/** Terminal como LUGAR: o painel, a aba, o botão que os abre. */
export const IconTerminalPanel = papel(SquareTerminal, CROMO)

/** Terminal como COMANDO: o que foi executado, o destino de execução. */
export const IconCommand = papel(Terminal, PADRAO)

export { META, PADRAO, CROMO }
