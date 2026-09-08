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
 * devolve.
 *
 * **A primeira versão pedia só "≥2 títulos e ≥500 caracteres em qualquer
 * lugar do texto" — e virou card até resposta de conversa comum.** O agente
 * organiza achados com `##` o tempo todo ("Achei três problemas: ## Problema
 * 1 … ## Problema 2 … ## Problema 3 …"), que é estrutura de verdade mas não é
 * documento — é uma frase corrida que usa heading como marcador de item. A
 * contagem de títulos não distingue isso de um plano.
 *
 * O que distingue é o COMEÇO. Um plano abre como plano: a primeira linha já é
 * o título. Uma resposta de conversa abre como conversa, mesmo quando organiza
 * o meio com `##` — por isso agora a primeira linha não-vazia do texto
 * PRECISA ser um heading. Perde-se algum documento real que comece com um
 * parágrafo de contexto antes do título; ganha-se não confundir "expliquei em
 * tópicos" com "escrevi um documento", que era o problema de verdade.
 *
 * Título dentro de bloco de código é descartado antes de contar — comentário
 * `# TODO` em Python, ou um heading de exemplo dentro de um ```markdown```,
 * senão qualquer resposta com um trecho de código markdown viraria "documento".
 */

const FENCE = /```[\s\S]*?```/g
const HEADING = /^#{1,3}\s+\S/gm
const OPENS_WITH_HEADING = /^#{1,3}\s+\S/

const MIN_CHARS = 500
const MIN_HEADINGS = 2

export interface DetectedDocument {
  title: string
  /** Quantos títulos de nível 1–3 tem, fora bloco de código. Informa a copy do card. */
  headingCount: number
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  )
}

/** A própria primeira linha, sem os `#` do heading e sem markdown grosso. */
function extractTitle(firstLine: string): string {
  return firstLine
    .replace(/^#{1,6}\s*/, '')
    .replace(/[*_`]/g, '')
    .trim()
    .slice(0, 80)
}

export function detectDocument(text: string): DetectedDocument | null {
  if (text.length < MIN_CHARS) return null

  // O texto tem de ABRIR como documento — não basta ter título em algum lugar.
  const opening = firstNonEmptyLine(text)
  if (!OPENS_WITH_HEADING.test(opening)) return null

  const withoutCode = text.replace(FENCE, '')
  const headingCount = withoutCode.match(HEADING)?.length ?? 0
  if (headingCount < MIN_HEADINGS) return null

  const title = extractTitle(opening)
  if (!title) return null

  return { title, headingCount }
}
