/**
 * Fecha marcadores de markdown ainda abertos durante o streaming.
 *
 * O texto chega pela metade, então é normal o snapshot terminar em algo como
 * `**Dados e sc`. Renderizado cru, o usuário vê os asteriscos na tela até o
 * modelo fechar o par. Aqui fechamos provisoriamente o que está aberto, de modo
 * que o trecho já apareça formatado e simplesmente continue crescendo.
 *
 * Nada disso altera o texto guardado: é só o que vai para a tela enquanto o
 * turno não termina.
 */
export function balanceMarkdown(input: string): string {
  if (!input) return input

  const lines = input.split('\n')
  let fenceOpen = false
  let fenceMarker = '```'

  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (!m) continue
    if (!fenceOpen) {
      fenceOpen = true
      fenceMarker = m[1]
    } else if (m[1][0] === fenceMarker[0] && m[1].length >= fenceMarker.length) {
      fenceOpen = false
    }
  }

  // Dentro de bloco de código não existe ênfase para fechar: só o próprio bloco.
  if (fenceOpen) return input + '\n' + fenceMarker

  let out = input

  // Fora de blocos, conta marcadores inline no texto visível.
  const visible = out.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, '')

  const countPairs = (text: string, token: string): number => {
    let n = 0
    let i = 0
    while ((i = text.indexOf(token, i)) !== -1) {
      n += 1
      i += token.length
    }
    return n
  }

  // Ordem importa: ** antes de *, senão o par negrito é contado como itálico.
  if (countPairs(visible, '**') % 2 === 1) out += '**'

  const italic = visible.replace(/\*\*/g, '')
  if (countPairs(italic, '*') % 2 === 1) out += '*'

  if (countPairs(visible, '~~') % 2 === 1) out += '~~'

  // Crase simples: ignora as que fazem parte de cercas.
  const inlineTicks = visible.replace(/`{3,}/g, '')
  if (countPairs(inlineTicks, '`') % 2 === 1) out += '`'

  // Link começado e não fechado renderiza como texto solto: esconde até fechar.
  const openLink = out.lastIndexOf('[')
  if (openLink !== -1) {
    const rest = out.slice(openLink)
    if (!/\]\([^)]*\)/.test(rest) && !rest.includes(']')) {
      out = out.slice(0, openLink)
    }
  }

  return out
}
