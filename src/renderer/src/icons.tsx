import {
  AlertTriangle,
  Check,
  CheckCircle2,
  GitBranch,
  Network,
  SquareTerminal,
  Terminal,
  X,
  Archive as _Archive,
  ArchiveRestore as _ArchiveRestore,
  ArrowDown as _ArrowDown,
  ArrowRight as _ArrowRight,
  ArrowUp as _ArrowUp,
  ArrowUpCircle as _ArrowUpCircle,
  AtSign as _AtSign,
  BarChart3 as _BarChart3,
  Bot as _Bot,
  Brain as _Brain,
  CalendarClock as _CalendarClock,
  ChevronDown as _ChevronDown,
  ChevronRight as _ChevronRight,
  ChevronUp as _ChevronUp,
  Circle as _Circle,
  CircleOff as _CircleOff,
  CircleSlash as _CircleSlash,
  Clock as _Clock,
  Code2 as _Code2,
  Command as _Command,
  Copy as _Copy,
  CornerDownRight as _CornerDownRight,
  Cpu as _Cpu,
  Download as _Download,
  ExternalLink as _ExternalLink,
  Eye as _Eye,
  EyeOff as _EyeOff,
  FileCode2 as _FileCode2,
  FileDiff as _FileDiff,
  FileJson as _FileJson,
  FileText as _FileText,
  FileWarning as _FileWarning,
  Folder as _Folder,
  FolderInput as _FolderInput,
  FolderOpen as _FolderOpen,
  FolderPlus as _FolderPlus,
  FolderTree as _FolderTree,
  Globe as _Globe,
  HeartPulse as _HeartPulse,
  Image as _Image,
  Info as _Info,
  KeyRound as _KeyRound,
  Layers as _Layers,
  Loader2 as _Loader2,
  LogOut as _LogOut,
  Mic as _Mic,
  MicOff as _MicOff,
  Minimize2 as _Minimize2,
  Monitor as _Monitor,
  MoreHorizontal as _MoreHorizontal,
  PanelLeft as _PanelLeft,
  PanelRight as _PanelRight,
  Pause as _Pause,
  Pencil as _Pencil,
  Pin as _Pin,
  PinOff as _PinOff,
  Play as _Play,
  Plug as _Plug,
  Plus as _Plus,
  Puzzle as _Puzzle,
  Radio as _Radio,
  RefreshCw as _RefreshCw,
  RotateCcw as _RotateCcw,
  Save as _Save,
  Search as _Search,
  Sparkles as _Sparkles,
  Square as _Square,
  SquarePen as _SquarePen,
  Target as _Target,
  Trash2 as _Trash2,
  UserRound as _UserRound,
  WandSparkles as _WandSparkles,
  Wrench as _Wrench,
  Zap as _Zap,
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

/*
  O resto do conjunto, com os padrões do app já aplicados.

  Não é invólucro por invólucro por gosto: são duas repetições medidas que
  somem. O traço de 1,75 estava escrito à mão em 203 usos, e `aria-hidden` não
  estava em praticamente nenhum ícone decorativo. Quem precisar de outro traço
  passa a prop — ela sobrescreve o padrão, e os casos que usam 2 e 2,5 continuam
  explícitos no lugar deles.

  Com a regra de `no-restricted-imports` no eslint, este arquivo passa a ser o
  único ponto do renderer que fala com o `lucide-react`: trocar de biblioteca
  vira uma edição, não quarenta e duas.
*/
export const Archive = papel(_Archive, PADRAO)
export const ArchiveRestore = papel(_ArchiveRestore, PADRAO)
export const ArrowDown = papel(_ArrowDown, PADRAO)
export const ArrowRight = papel(_ArrowRight, PADRAO)
export const ArrowUp = papel(_ArrowUp, PADRAO)
export const ArrowUpCircle = papel(_ArrowUpCircle, PADRAO)
export const AtSign = papel(_AtSign, PADRAO)
export const BarChart3 = papel(_BarChart3, PADRAO)
export const Bot = papel(_Bot, PADRAO)
export const Brain = papel(_Brain, PADRAO)
export const CalendarClock = papel(_CalendarClock, PADRAO)
export const ChevronDown = papel(_ChevronDown, PADRAO)
export const ChevronRight = papel(_ChevronRight, PADRAO)
export const ChevronUp = papel(_ChevronUp, PADRAO)
export const Circle = papel(_Circle, PADRAO)
export const CircleOff = papel(_CircleOff, PADRAO)
export const CircleSlash = papel(_CircleSlash, PADRAO)
export const Clock = papel(_Clock, PADRAO)
export const Code2 = papel(_Code2, PADRAO)
export const Command = papel(_Command, PADRAO)
export const Copy = papel(_Copy, PADRAO)
export const CornerDownRight = papel(_CornerDownRight, PADRAO)
export const Cpu = papel(_Cpu, PADRAO)
export const Download = papel(_Download, PADRAO)
export const ExternalLink = papel(_ExternalLink, PADRAO)
export const Eye = papel(_Eye, PADRAO)
export const EyeOff = papel(_EyeOff, PADRAO)
export const FileCode2 = papel(_FileCode2, PADRAO)
export const FileDiff = papel(_FileDiff, PADRAO)
export const FileJson = papel(_FileJson, PADRAO)
export const FileText = papel(_FileText, PADRAO)
export const FileWarning = papel(_FileWarning, PADRAO)
export const Folder = papel(_Folder, PADRAO)
export const FolderInput = papel(_FolderInput, PADRAO)
export const FolderOpen = papel(_FolderOpen, PADRAO)
export const FolderPlus = papel(_FolderPlus, PADRAO)
export const FolderTree = papel(_FolderTree, PADRAO)
export const Globe = papel(_Globe, PADRAO)
export const HeartPulse = papel(_HeartPulse, PADRAO)
export const Image = papel(_Image, PADRAO)
export const Info = papel(_Info, PADRAO)
export const KeyRound = papel(_KeyRound, PADRAO)
export const Layers = papel(_Layers, PADRAO)
export const Loader2 = papel(_Loader2, PADRAO)
export const LogOut = papel(_LogOut, PADRAO)
export const Mic = papel(_Mic, PADRAO)
export const MicOff = papel(_MicOff, PADRAO)
export const Minimize2 = papel(_Minimize2, PADRAO)
export const Monitor = papel(_Monitor, PADRAO)
export const MoreHorizontal = papel(_MoreHorizontal, PADRAO)
export const PanelLeft = papel(_PanelLeft, PADRAO)
export const PanelRight = papel(_PanelRight, PADRAO)
export const Pause = papel(_Pause, PADRAO)
export const Pencil = papel(_Pencil, PADRAO)
export const Pin = papel(_Pin, PADRAO)
export const PinOff = papel(_PinOff, PADRAO)
export const Play = papel(_Play, PADRAO)
export const Plug = papel(_Plug, PADRAO)
export const Plus = papel(_Plus, PADRAO)
export const Puzzle = papel(_Puzzle, PADRAO)
export const Radio = papel(_Radio, PADRAO)
export const RefreshCw = papel(_RefreshCw, PADRAO)
export const RotateCcw = papel(_RotateCcw, PADRAO)
export const Save = papel(_Save, PADRAO)
export const Search = papel(_Search, PADRAO)
export const Sparkles = papel(_Sparkles, PADRAO)
export const Square = papel(_Square, PADRAO)
export const SquarePen = papel(_SquarePen, PADRAO)
export const Target = papel(_Target, PADRAO)
export const Trash2 = papel(_Trash2, PADRAO)
export const UserRound = papel(_UserRound, PADRAO)
export const WandSparkles = papel(_WandSparkles, PADRAO)
export const Wrench = papel(_Wrench, PADRAO)
export const Zap = papel(_Zap, PADRAO)
