import { useEffect, useState } from 'react'
import { useAgent } from '../store/agent'
import type { ToolExec } from '../store/agent'

/**
 * Há quanto tempo o turno não dá sinal de vida.
 *
 * Escrito depois de um caso real: o agente criou três subagentes e, no mesmo
 * turno, disparou uma consulta ao Postgres que ficou presa atrás de uma trava —
 * 40 minutos, depois abortada, depois a mesma consulta outra vez por 59. Duas
 * horas em que a janela mostrou exatamente o mesmo spinner que mostra numa
 * chamada de dois segundos. Os subagentes terminaram em 5 minutos e os
 * relatórios ficaram na fila, invisíveis, esperando o turno do pai acabar.
 *
 * Nada disso era detectável na tela. Este hook mede as duas formas de silêncio:
 *
 * - `tool` — uma chamada de ferramenta específica está rodando há muito tempo.
 *   É o caso acima, e o mais comum.
 * - `quiet` — o turno está em curso, nenhuma ferramenta rodando, e nada novo
 *   chega. Costuma ser requisição ao modelo pendurada.
 *
 * **Demora não é erro.** Build e teste levam minutos legitimamente, então isto
 * não diagnostica nada: informa o tempo e oferece o botão de interromper. A
 * decisão continua sendo de quem está olhando.
 */

/** A partir daqui a interface fala. Curto demais viraria ruído em build. */
export const NOTICE_AFTER_MS = 3 * 60_000
/** Passado disto, a chamada mais longa ganha destaque de alerta no card. */
export const WARN_AFTER_MS = 60_000

/*
  Um relógio para toda a tela.

  Vários componentes precisam do segundo corrente — o aviso e cada card com
  chamada em curso. Um `setInterval` por componente multiplicaria timers pela
  quantidade de cards na conversa, então há um só, ligado enquanto existir
  alguém inscrito e desligado quando o último sai.
*/
/*
  Um timer para toda a tela.

  Vários componentes precisam redesenhar a cada segundo — o aviso e cada card
  com chamada em curso. Um `setInterval` por componente multiplicaria timers
  pela quantidade de cards da conversa, então há um só, ligado enquanto existir
  alguém inscrito e desligado quando o último sai.
*/
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | null = null

function subscribeClock(fn: () => void): () => void {
  clockListeners.add(fn)
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      for (const l of clockListeners) l()
    }, 1000)
  }
  return () => {
    clockListeners.delete(fn)
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

/**
 * Agora, redesenhado a cada segundo enquanto `active`.
 *
 * Devolve `Date.now()` na renderização, e usa o timer apenas para forçar o
 * repaint. A primeira versão guardava o instante em estado e comparava com
 * `Date.now()` de outro lugar — duas fontes de tempo, que dessincronizavam e
 * chegavam a dar diferença negativa quando o estado era semeado antes do efeito
 * que gravava a outra ponta.
 *
 * Com `active` falso não se inscreve e não redesenha — é o que mantém o app
 * parado realmente parado. O projeto já pagou o preço de um poller sempre
 * ligado: 0,67s de CPU por ciclo, ~22% de um núcleo sem ninguém olhando.
 */
export function useTurnClock(active: boolean): number {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    return subscribeClock(() => setTick((n) => n + 1))
  }, [active])

  return Date.now()
}

export type StallKind = 'tool' | 'quiet'

export interface TurnActivity {
  /** `null` enquanto está tudo normal — nada a dizer. */
  stall: Stall | null
  /** Relógio compartilhado, para os cards não abrirem um timer cada. */
  now: number
}

export interface Stall {
  kind: StallKind
  ms: number
  tool?: ToolExec
}

export interface ActivitySnapshot {
  streaming: boolean
  tools: Record<string, ToolExec>
  /** Última mudança visível na conversa, em epoch ms. */
  lastChange: number
  now: number
}

function longestRunning(tools: Record<string, ToolExec>, now: number): ToolExec | null {
  let worst: ToolExec | null = null
  let worstMs = -1
  for (const exec of Object.values(tools)) {
    if (exec.status !== 'running' || !exec.startedAt) continue
    const ms = now - exec.startedAt
    if (ms > worstMs) {
      worstMs = ms
      worst = exec
    }
  }
  return worst
}

/**
 * A decisão, sem React.
 *
 * Separada do hook para poder ser testada com entradas fabricadas — os limiares
 * são de minutos, e verificar isso na tela exigiria esperar minutos.
 */
export function stallOf({ streaming, tools, lastChange, now }: ActivitySnapshot): Stall | null {
  if (!streaming) return null

  const worst = longestRunning(tools, now)
  if (worst?.startedAt) {
    const ms = Math.max(0, now - worst.startedAt)
    if (ms >= NOTICE_AFTER_MS) return { kind: 'tool', ms, tool: worst }
    // Uma ferramenta rodando é sinal de vida: não conta como silêncio.
    return null
  }

  const quiet = Math.max(0, now - lastChange)
  if (quiet >= NOTICE_AFTER_MS) return { kind: 'quiet', ms: quiet }

  return null
}

export function useTurnActivity(): TurnActivity {
  const streaming = useAgent((s) => s.state?.isStreaming ?? false)
  const messages = useAgent((s) => s.messages)
  const tools = useAgent((s) => s.tools)

  const now = useTurnClock(streaming)

  /*
    Última mudança visível na conversa. `messages` e `tools` são substituídos por
    novos objetos a cada evento, então a identidade deles é o sinal — não é
    preciso comparar conteúdo.

    `streaming` entra nas dependências por um motivo concreto: sem ele, um app
    aberto e parado por uma hora guardaria um `lastChange` de uma hora atrás, e
    o primeiro turno começaria já com o aviso na tela. Começar um turno É
    atividade, então zera aqui.
  */
  const [lastChange, setLastChange] = useState(() => Date.now())
  useEffect(() => {
    setLastChange(Date.now())
  }, [messages, tools, streaming])

  return { stall: stallOf({ streaming, tools, lastChange, now }), now }
}
