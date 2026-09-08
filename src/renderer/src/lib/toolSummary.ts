/**
 * Resumo de uma linha para uma chamada de ferramenta.
 *
 * Extraído do `ToolCard` quando o aviso de turno silencioso passou a precisar
 * do mesmo texto. Duplicar já custou caro neste projeto: `fmtSize` existia em
 * dois lugares com precisão diferente, e o mesmo arquivo aparecia como 12 KB
 * numa tela e 11,7 KB na outra.
 */

export function codeFrom(args: Record<string, unknown>): string | null {
  const code = args?.code
  if (typeof code === 'string') return code
  const cmd = args?.command
  if (typeof cmd === 'string') return cmd
  return null
}

export function summary(name: string, args: Record<string, unknown>): string {
  const code = codeFrom(args)
  if (code) {
    const isBash = code.trimStart().startsWith('%%bash')
    // A linha da magic `%%bash` não informa nada: mostra o primeiro comando real.
    const meaningful = code
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('%%') && !l.startsWith('#'))
    const first = meaningful[0] ?? code.trim()
    const label = isBash ? 'shell' : name
    return `${label} · ${first.slice(0, 74)}`
  }
  const keys = Object.keys(args ?? {})
  return keys.length ? `${name} · ${keys.slice(0, 3).join(', ')}` : name
}
