/**
 * Anexo que não é imagem.
 *
 * O RPC do prime-agent transporta só `ImageContent`, então um PDF não sobe como
 * anexo — quem lê o arquivo é o agente, pelo caminho. Mas *mostrar* o caminho
 * cru no meio da mensagem é feio e não é o que o usuário pediu ao arrastar o
 * arquivo. A solução é separar o que é enviado do que é exibido:
 *
 *   enviado  → o texto do usuário com os caminhos em linhas próprias no fim
 *   exibido  → o texto do usuário, e os caminhos como chips de anexo
 *
 * Nada é escondido do agente nem inventado na tela: a bolha mostra exatamente o
 * que foi mandado, só que formatado.
 */

/** Linha que é um caminho absoluto sozinho, com extensão. */
const PATH_LINE = /^(?:\/|~\/)[^\n]*\.[A-Za-z0-9]{1,8}$/

export interface SplitMessage {
  /** O que a pessoa escreveu. */
  body: string
  /** Caminhos anexados, na ordem em que foram acrescentados. */
  paths: string[]
}

/**
 * Separa os caminhos que o composer acrescentou no fim da mensagem.
 *
 * Só o rabo é examinado: um caminho citado no meio de um parágrafo continua
 * sendo texto normal, porque ali ele faz parte da frase.
 */
export function splitTrailingPaths(text: string): SplitMessage {
  const lines = text.split('\n')
  const paths: string[] = []

  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim()
    if (last === '') {
      lines.pop()
      continue
    }
    if (!PATH_LINE.test(last)) break
    paths.unshift(last)
    lines.pop()
  }

  return { body: lines.join('\n').trimEnd(), paths }
}

/** Junta corpo e caminhos no formato que vai para o agente. */
export function joinWithPaths(body: string, paths: string[]): string {
  const clean = body.trim()
  if (paths.length === 0) return clean
  return clean.length > 0 ? `${clean}\n\n${paths.join('\n')}` : paths.join('\n')
}

/** Nome do arquivo, para o rótulo do chip. */
export function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}
