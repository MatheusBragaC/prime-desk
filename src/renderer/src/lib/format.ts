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

/**
 * Cronômetro em curso.
 *
 * Separado do `fmtDuration` por causa do decimal: em duração já fechada,
 * "12.3s" é precisão útil; num relógio que anda de segundo em segundo, o
 * decimal fica sempre em `.0` e só faz o número tremer. Minutos e horas vêm com
 * zero à esquerda para a largura não dançar a cada tique.
 */
export function fmtElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * `Lang` da interface para a etiqueta BCP 47 que o `Intl` entende.
 *
 * `pt` sozinho resolve para pt-PT. Nos seis formatos que este arquivo usa os
 * dois coincidem hoje — conferido — mas a interface é pt-BR, e depender de uma
 * coincidência do CLDR para acertar a região é sorte, não decisão.
 */
function locale(lang: string): string {
  return lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en'
}

/**
 * "agora" — o único degrau que quer `numeric: 'auto'`.
 *
 * Com `'always'`, zero vira "em 0 seg.", "in 0s", "dentro de 0 s": correto e
 * inútil. Os demais degraus continuam em `'always'` para não trocar durações
 * por palavras ("anteontem") no meio de uma coluna de números.
 */
function agora(lang: string): string {
  return new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto', style: 'narrow' }).format(
    0,
    'second'
  )
}

/**
 * Data absoluta curta, com o ano só quando ele não é o corrente.
 *
 * "11 de jul." basta para algo deste ano; de dois anos atrás, sem o ano, é
 * uma data ambígua.
 */
function absDate(ms: number, lang: string): string {
  const d = new Date(ms)
  const mesmoAno = d.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(locale(lang), {
    day: 'numeric',
    month: 'short',
    ...(mesmoAno ? {} : { year: 'numeric' })
  }).format(d)
}

/**
 * Tempo decorrido desde um instante.
 *
 * `numeric: 'always'` de propósito: com `'auto'`, dois dias atrás vira
 * "anteontem" e vinte dias vira "há 20 dias" — uma palavra no meio de uma
 * coluna de durações. O estilo estreito mantém a largura sob controle, que
 * importa na linha de metadados da árvore de agentes.
 */
export function relTime(iso: string, lang: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'always', style: 'narrow' })

  const sec = Math.floor(diff / 1000)
  if (sec < 1) return agora(lang)
  if (sec < 60) return rtf.format(-sec, 'second')
  const min = Math.floor(sec / 60)
  if (min < 60) return rtf.format(-min, 'minute')
  const h = Math.floor(min / 60)
  if (h < 24) return rtf.format(-h, 'hour')
  const d = Math.floor(h / 24)
  if (d < 30) return rtf.format(-d, 'day')
  return absDate(then, lang)
}

/**
 * Quanto falta até um instante futuro.
 *
 * Contraparte do `relTime`, que calcula `agora − data` e por isso devolve
 * "agora" para qualquer data futura — o diff fica negativo e cai no primeiro
 * ramo. Um agendamento que dispara em uma hora aparecia como "agora".
 *
 * Data já vencida também é "agora": o disparo está em atraso e vai acontecer
 * na próxima verificação, não num futuro que valha contar.
 */
export function untilTime(iso: string, lang: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = then - Date.now()
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'always', style: 'narrow' })
  if (diff <= 0) return agora(lang)

  const sec = Math.floor(diff / 1000)
  if (sec < 60) return rtf.format(sec, 'second')
  const min = Math.floor(sec / 60)
  if (min < 60) return rtf.format(min, 'minute')
  const h = Math.floor(min / 60)
  if (h < 24) return rtf.format(h, 'hour')
  const d = Math.floor(h / 24)
  if (d < 30) return rtf.format(d, 'day')
  return absDate(then, lang)
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
  // Idioma da interface, não o do sistema: `toLocaleString()` sem argumento
  // punha ponto de milhar num app em inglês rodando em máquina brasileira.
  return n.toLocaleString(locale(lang))
}

/** Hora do dia no formato local: "9 AM" em inglês, "17h" nos demais. */
export function fmtHour(hour: number, lang: string): string {
  if (lang !== 'en') return `${String(hour).padStart(2, '0')}h`
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}
