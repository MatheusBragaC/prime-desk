/**
 * Divide o texto em transmissão numa parte estável e numa cauda viva.
 *
 * O porquê: durante o streaming, o texto exibido muda a cada quadro, e cada
 * mudança fazia o `react-markdown` reparsear a mensagem **inteira**. Medido com
 * o pipeline remark/rehype deste app:
 *
 * | tamanho     | por parse |
 * |-------------|-----------|
 * |    744 char |    3,0 ms |
 * |  2.976 char |    5,2 ms |
 * |  7.440 char |   10,2 ms |
 * | 14.880 char |   26,7 ms |
 *
 * O orçamento de um quadro a 60fps é 16,7 ms. Ou seja, passando de ~10 mil
 * caracteres um único parse já estoura o quadro sozinho — e a resposta longa,
 * justamente onde o app precisa parecer firme, ficava cada vez mais pesada.
 *
 * Com o corte, só a cauda (poucos parágrafos) é reparseada a cada quadro; o
 * prefixo é memoizado e só refaz o trabalho quando um bloco novo se fecha. O
 * custo por quadro passa a ser função do tamanho da cauda, não da mensagem.
 *
 * O corte é sempre numa linha em branco, e nunca dentro de bloco de código:
 * partir no meio de uma cerca deixaria as duas metades inválidas.
 */

/** Deixa uma folga antes de cortar: parágrafos recém-fechados ainda mudam. */
const TAIL_MIN = 400

export interface StreamSplit {
  /** Já fechado: renderiza como markdown e é memoizado. */
  stable: string
  /** Em construção: reparseado a cada quadro, por isso mantido curto. */
  tail: string
}

/** Número de cercas ``` até `end`. Ímpar significa bloco de código aberto. */
function fencesBefore(text: string, end: number): number {
  let count = 0
  let i = text.indexOf('```')
  while (i !== -1 && i < end) {
    count++
    i = text.indexOf('```', i + 3)
  }
  return count
}

export function splitStream(text: string): StreamSplit {
  if (text.length <= TAIL_MIN) return { stable: '', tail: text }

  const limit = text.length - TAIL_MIN
  let cut = text.lastIndexOf('\n\n', limit)

  // Recua enquanto o corte cair dentro de um bloco de código.
  while (cut > 0 && fencesBefore(text, cut) % 2 === 1) {
    cut = text.lastIndexOf('\n\n', cut - 1)
  }

  if (cut <= 0) return { stable: '', tail: text }
  return { stable: text.slice(0, cut + 2), tail: text.slice(cut + 2) }
}
