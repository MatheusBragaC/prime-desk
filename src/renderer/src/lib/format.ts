export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function fmtCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toFixed(2)
}

/**
 * Tamanho de arquivo.
 *
 * Existia duas vezes com precisão diferente — o explorador arredondava KB para
 * inteiro e o visor para uma casa, então o mesmo arquivo aparecia como "12 KB"
 * numa tela e "11.7 KB" na outra. Vale mais uma regra só: a casa decimal serve
 * pra decidir se um arquivo cabe na janela antes de abrir.
 */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function fmtDuration(ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

export function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d`
  return new Date(then).toLocaleDateString('pt-BR')
}

export function shortPath(p: string, home: string): string {
  if (!p) return ''
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

/**
 * Quantidade abreviada, como o Claude Desktop mostra: 8.3B, 60.4k, 148.
 * Bilhão em pt-BR e es é "bi"/"mm"; usamos B só em inglês para não confundir.
 */
export function fmtCount(n: number, lang: string): string {
  const bi = lang === 'en' ? 'B' : 'bi'
  const mi = lang === 'en' ? 'M' : 'mi'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}${bi}`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}${mi}`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

/** Hora do dia no formato local: "9 AM" em inglês, "17h" nos demais. */
export function fmtHour(hour: number, lang: string): string {
  if (lang !== 'en') return `${String(hour).padStart(2, '0')}h`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}
