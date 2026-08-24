import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { UsageStats } from '../shared/protocol.js'

const SESSIONS_DIR = join(homedir(), '.prime', 'agent', 'sessions')
const HEATMAP_DAYS = 133 // 19 semanas cheias

interface FileAgg {
  messages: number
  tokens: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  models: Record<string, number>
  perDay: Record<string, number>
  perHour: number[]
}

/** Cache por mtime: relê só o que mudou. Sessões grandes chegam a vários MB. */
const cache = new Map<string, { mtimeMs: number; size: number; agg: FileAgg }>()

function emptyAgg(): FileAgg {
  return {
    messages: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    cost: 0, models: {}, perDay: {}, perHour: new Array(24).fill(0)
  }
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function scan(content: string): FileAgg {
  const agg = emptyAgg()

  for (const line of content.split('\n')) {
    if (!line) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    const type = entry.type as string | undefined
    const timestamp = entry.timestamp as string | undefined

    if (type === 'message') {
      const msg = entry.message as
        | {
            role?: string
            model?: string
            usage?: {
              totalTokens?: number
              input?: number
              output?: number
              cacheRead?: number
              cacheWrite?: number
              cost?: { total?: number }
            }
          }
        | undefined
      if (!msg?.role) continue

      agg.messages += 1

      if (timestamp) {
        const day = dayKey(timestamp)
        agg.perDay[day] = (agg.perDay[day] ?? 0) + 1
        const hour = new Date(timestamp).getHours()
        if (!Number.isNaN(hour)) agg.perHour[hour] += 1
      }

      if (msg.role === 'assistant') {
        /*
          Mesma quebra que o agente usa em `get_session_stats`. Somar tudo num
          número só inflava a leitura: cache read/write costuma ser uma ordem de
          grandeza maior que o texto e tem preço próprio.
        */
        const u = msg.usage
        agg.tokens += u?.totalTokens ?? 0
        agg.input += u?.input ?? 0
        agg.output += u?.output ?? 0
        agg.cacheRead += u?.cacheRead ?? 0
        agg.cacheWrite += u?.cacheWrite ?? 0
        agg.cost += u?.cost?.total ?? 0
        if (msg.model) agg.models[msg.model] = (agg.models[msg.model] ?? 0) + 1
      }
      continue
    }

    // Uso dos subagentes é atribuído ao pai: sem isso o total fica subestimado.
    if (type === 'child_usage_attributed') {
      const u = entry.childUsage as
        | { totalTokens?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } }
        | undefined
      agg.tokens += u?.totalTokens ?? 0
      agg.input += u?.input ?? 0
      agg.output += u?.output ?? 0
      agg.cacheRead += u?.cacheRead ?? 0
      agg.cacheWrite += u?.cacheWrite ?? 0
      agg.cost += u?.cost?.total ?? 0
    }
  }

  return agg
}

export async function getUsageStats(): Promise<UsageStats> {
  let files: string[] = []
  try {
    files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return emptyStats()
  }

  const total = emptyAgg()
  let sessions = 0

  for (const file of files) {
    const path = join(SESSIONS_DIR, file)
    let agg: FileAgg
    try {
      const info = await stat(path)
      const hit = cache.get(path)
      if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) {
        agg = hit.agg
      } else {
        agg = scan(await readFile(path, 'utf-8'))
        cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, agg })
      }
    } catch {
      continue
    }

    sessions += 1
    total.messages += agg.messages
    total.tokens += agg.tokens
    total.input += agg.input
    total.output += agg.output
    total.cacheRead += agg.cacheRead
    total.cacheWrite += agg.cacheWrite
    total.cost += agg.cost
    for (const [m, n] of Object.entries(agg.models)) total.models[m] = (total.models[m] ?? 0) + n
    for (const [d, n] of Object.entries(agg.perDay)) total.perDay[d] = (total.perDay[d] ?? 0) + n
    for (let h = 0; h < 24; h++) total.perHour[h] += agg.perHour[h]
  }

  // Limpa entradas de arquivos removidos.
  const alive = new Set(files.map((f) => join(SESSIONS_DIR, f)))
  for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key)

  const days: { day: string; count: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ day: key, count: total.perDay[key] ?? 0 })
  }

  const activeDays = Object.values(total.perDay).filter((n) => n > 0).length

  // Streak conta para trás a partir de hoje; hoje sem atividade ainda não quebra.
  let current = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current += 1
    else if (i !== days.length - 1) break
  }

  let longest = 0
  let run = 0
  for (const d of days) {
    if (d.count > 0) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }

  const favorite =
    Object.entries(total.models).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

  const peakHour = total.perHour.indexOf(Math.max(...total.perHour))

  return {
    sessions,
    messages: total.messages,
    tokens: total.tokens,
    input: total.input,
    output: total.output,
    cacheRead: total.cacheRead,
    cacheWrite: total.cacheWrite,
    cost: total.cost,
    activeDays,
    currentStreak: current,
    longestStreak: longest,
    favoriteModel: favorite,
    peakHour: total.messages > 0 ? peakHour : -1,
    days
  }
}

function emptyStats(): UsageStats {
  return {
    sessions: 0, messages: 0, tokens: 0, input: 0, output: 0, cacheRead: 0,
    cacheWrite: 0, cost: 0, activeDays: 0,
    currentStreak: 0, longestStreak: 0, favoriteModel: '', peakHour: -1, days: []
  }
}
