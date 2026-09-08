/**
 * "Isto é um documento, não uma frase" — a decisão que separa um plano ou
 * relatório de uma resposta comum.
 *
 * O prime-agent não tem o que o Claude Desktop chama de Artifacts: não existe
 * bloco de conteúdo, ferramenta ou evento de protocolo para isso — conferido no
 * SDK empacotado do agente (`anthropic-*.js`), que lista os betas da Anthropic
 * em uso (`files-api`, `oauth`, `skills`, …) e não tem nenhum relativo a
 * artifact. É recurso do produto de chat do Claude, amarrado a um prompt de
 * sistema que só a Anthropic controla — não é algo que a API exponha, e
 * portanto não é algo que o prime-agent, que fala com a API pura, possa herdar.
 *
 * O que dá para fazer é o efeito: heurística sobre o texto puro que o agente já
 * devolve. Um plano de verdade tem estrutura — vários títulos — e é longo.
 * Uma resposta comum com "aqui vai o código" e um `## Notas` no fim não conta:
 * por isso o limite pede pelo menos dois títulos, não um.
 *
 * Título dentro de bloco de código é descartado antes de contar — comentário
 * `# TODO` em Python, ou um heading de exemplo dentro de um ```markdown```,
 * senão qualquer resposta com um trecho de código markdown viraria "documento".
 */

const FENCE = /```[\s\S]*?```/g
const HEADING = /^#{1,3}\s+\S/gm

const MIN_CHARS = 500
const MIN_HEADINGS = 2

export interface DetectedDocument {
  title: string
  /** Quantos títulos de nível 1–3 tem, fora bloco de código. Informa a copy do card. */
  headingCount: number
}

/** Primeira linha não vazia, sem os `#` do heading e sem markdown grosso. */
function extractTitle(text: string): string {
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!firstLine) return ''
  return firstLine
    .replace(/^#{1,6}\s*/, '')
    .replace(/[*_`]/g, '')
    .trim()
    .slice(0, 80)
}

export function detectDocument(text: string): DetectedDocument | null {
  if (text.length < MIN_CHARS) return null

  const withoutCode = text.replace(FENCE, '')
  const headingCount = withoutCode.match(HEADING)?.length ?? 0
  if (headingCount < MIN_HEADINGS) return null

  const title = extractTitle(text)
  if (!title) return null

  return { title, headingCount }
}
