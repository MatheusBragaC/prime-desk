import { RpcClient } from './rpc-client.js'

/**
 * Gera um título curto para a conversa.
 *
 * Usa um cliente RPC efêmero em vez do modo print (`-p`). Motivo empírico: o
 * modo print, lançado a partir do processo main do Electron, não retorna — fica
 * pendurado até o timeout, sem stderr. O mesmo binário em `--mode rpc` funciona
 * (é o que a ponte principal já usa), então o título vai por esse caminho.
 *
 * A sessão é descartável: `--no-session`, sem ferramentas, skills, extensões ou
 * arquivos de contexto. É só uma completion de texto.
 */

const TITLE_MODEL = 'anthropic/claude-haiku-4-5'
const READY_TIMEOUT_MS = 30_000
const TURN_TIMEOUT_MS = 45_000
const MAX_CHARS = 52

const PROMPT = `Gere um título curto para a conversa abaixo.

Regras:
- No máximo 6 palavras.
- Sem aspas, sem ponto final, sem prefixos como "Título:".
- Escreva no mesmo idioma da conversa.
- Descreva o assunto, não o formato. Nada de "pergunta do usuário".
- Responda SOMENTE com o título.

Conversa:
`

/** Remove enfeites que modelos acrescentam apesar da instrução. */
export function sanitizeTitle(raw: string): string {
  let t = raw.trim().split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
  t = t.replace(/^(t[ií]tulo|title)\s*[:\-–]\s*/i, '')
  t = t.replace(/^["'“”«]+|["'“”»]+$/g, '')
  t = t.replace(/[.]+$/, '')
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS)
    const space = cut.lastIndexOf(' ')
    t = (space > 20 ? cut.slice(0, space) : cut).trim()
  }
  return t
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function generateTitle(conversation: string, cwd: string): Promise<string | null> {
  const client = new RpcClient({
    cwd,
    model: TITLE_MODEL,
    extraArgs: ['--no-session', '--no-tools', '--no-skills', '--no-extensions', '--no-context-files']
  })

  try {
    client.start()

    // Espera o worker aceitar comandos.
    const deadline = Date.now() + READY_TIMEOUT_MS
    let ready = false
    while (Date.now() < deadline) {
      await delay(600)
      try {
        const res = await client.send('get_state')
        if (res.success) {
          ready = true
          break
        }
      } catch {
        /* ainda subindo */
      }
    }
    if (!ready) return null

    const finished = new Promise<void>((resolve) => {
      const onEvent = (ev: { type?: string }) => {
        if (ev?.type === 'agent_end') {
          client.off('event', onEvent)
          resolve()
        }
      }
      client.on('event', onEvent)
    })

    const sent = await client.send('prompt', { message: PROMPT + conversation.slice(0, 2000) })
    if (!sent.success) return null

    const timedOut = await Promise.race([
      finished.then(() => false),
      delay(TURN_TIMEOUT_MS).then(() => true)
    ])
    if (timedOut) return null

    const res = await client.send<{ text?: string }>('get_last_assistant_text')
    const text = res.success ? (res.data?.text ?? '') : ''
    const title = sanitizeTitle(text)
    return title.length >= 3 ? title : null
  } catch {
    return null
  } finally {
    client.stop()
  }
}
