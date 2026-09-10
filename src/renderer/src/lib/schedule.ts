import type { AgentCronScheduleKind } from '@shared/protocol'

/**
 * Espelho da gramática de agendamento do prime-agent.
 *
 * Existe para validar e prever o próximo disparo antes de mandar ao agente, em
 * vez de a pessoa descobrir o erro depois de escrever o prompt inteiro.
 *
 * Copiado do `parseAgentCronSchedule` do binário instalado, não de memória — as
 * regras têm assimetrias que ninguém adivinha: `in` aceita dias e `every` não,
 * o intervalo mínimo é 10 s, e `at` exige data futura.
 *
 * Para cron a validação é só de FORMA. O cálculo do próximo disparo fica com o
 * servidor: reimplementar cron aqui criaria duas verdades, e a que aparece na
 * tela seria a errada. O `nextRunAt` do job devolvido é a fonte.
 */

export interface ParsedSchedule {
  kind: AgentCronScheduleKind
  expression: string
  intervalMs?: number
  /** Ausente em cron: só o servidor sabe. */
  nextRunAt?: Date
}

const SECOND = 1000
const MINUTE = 60 * SECOND

const IN_RE = /^in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i
const EVERY_RE =
  /^(?:every|each)\s+(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/i

const CRON_ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *'
}

/** O agente aceita a expressão entre aspas; tirar aqui evita divergir dele. */
function stripQuotes(value: string): string {
  const q = value.length >= 2 && (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
  return q ? value.slice(1, -1) : value
}

/**
 * Valida a forma de uma expressão cron.
 *
 * Cinco campos e um alfabeto restrito. Não confere se o dia 31 existe no mês —
 * isso é trabalho do servidor, e recusar aqui o que ele aceitaria seria pior
 * que deixar passar.
 */
function looksLikeCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  return fields.every((f) => /^[0-9*/,-]+$/.test(f))
}

export type ScheduleResult =
  | { ok: true; parsed: ParsedSchedule }
  | { ok: false; error: 'empty' | 'interval-too-short' | 'invalid-date' | 'past-date' | 'invalid-cron' }

export function parseSchedule(input: string, now = new Date()): ScheduleResult {
  const text = stripQuotes(input.trim())
  if (!text) return { ok: false, error: 'empty' }

  const inMatch = IN_RE.exec(text)
  if (inMatch) {
    const amount = Number.parseInt(inMatch[1], 10)
    const unit = inMatch[2].toLowerCase()
    // Decidido pela primeira letra, como no agente: m/h/d.
    const multiplier =
      unit.startsWith('m') ? MINUTE : unit.startsWith('h') ? 60 * MINUTE : 24 * 60 * MINUTE
    return {
      ok: true,
      parsed: {
        kind: 'once',
        expression: text,
        nextRunAt: new Date(now.getTime() + amount * multiplier)
      }
    }
  }

  const everyMatch = EVERY_RE.exec(text)
  if (everyMatch) {
    const amount = Number.parseInt(everyMatch[1], 10)
    const unit = everyMatch[2].toLowerCase()
    const multiplier =
      unit.startsWith('s') ? SECOND : unit.startsWith('m') ? MINUTE : 60 * MINUTE
    const intervalMs = amount * multiplier
    if (intervalMs < 10 * SECOND) return { ok: false, error: 'interval-too-short' }
    return {
      ok: true,
      parsed: {
        kind: 'interval',
        expression: text,
        intervalMs,
        nextRunAt: new Date(now.getTime() + intervalMs)
      }
    }
  }

  if (text.toLowerCase().startsWith('at ')) {
    const when = new Date(text.slice(3).trim())
    if (!Number.isFinite(when.getTime())) return { ok: false, error: 'invalid-date' }
    if (when.getTime() <= now.getTime()) return { ok: false, error: 'past-date' }
    return { ok: true, parsed: { kind: 'once', expression: text, nextRunAt: when } }
  }

  const expression = CRON_ALIASES[text] ?? text
  if (!looksLikeCron(expression)) return { ok: false, error: 'invalid-cron' }
  // Sem `nextRunAt`: quem calcula cron é o servidor.
  return { ok: true, parsed: { kind: 'cron', expression } }
}

/** Sugestões para quem não sabe a sintaxe. A primeira é o padrão do heartbeat. */
export const SCHEDULE_EXAMPLES = ['every 5m', 'every 30s', 'in 2h', '@daily', '0 9 * * 1-5']
