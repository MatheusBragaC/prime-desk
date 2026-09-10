import type { AgentMessage } from '../../../shared/protocol'
import { useAgent, refreshState, type UiMessage } from './agentStore'
import { bridge, rpc } from './rpc'
import { mutateFolders, refreshSessions } from './catalog'

/* Nome da conversa: o automático do primeiro turno e o gerado em lote. */

function plainText(m: UiMessage): string {
  return m.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join(' ')
    .trim()
}

/**
 * Gera título para uma conversa qualquer, sem abrir ela.
 *
 * Lê o transcript do disco (`transcript`, o mesmo canal que o carregamento
 * usa) em vez de trocar a ponte de sessão: trocar mataria o turno em andamento
 * e promoveria a conversa a residente no daemon — preço absurdo para dar nome
 * a uma linha da lista.
 *
 * O nome vai para `folders.titles`, o MESMO lugar onde o renomear manual grava.
 * Duas razões: `set_session_name` só age na sessão ativa, então não serviria
 * para o lote; e assim o título gerado é editável e apagável exatamente como um
 * renomeado à mão, sem virar um estado especial que a pessoa não consegue
 * desfazer.
 *
 * @returns o título gravado, ou `null` se não deu para gerar.
 */
export async function generateTitleFor(session: {
  id: string
  path: string
}): Promise<string | null> {
  const tail = await bridge().transcript(session.path, 40)
  if (!tail?.ok) return null

  const entries = tail.entries as { type?: string; message?: AgentMessage }[]
  const msgs = entries.filter((e) => e.type === 'message' && e.message).map((e) => e.message!)

  const user = msgs.find((m) => m.role === 'user')
  if (!user) return null
  const assistant = msgs.find((m) => m.role === 'assistant')

  const flat = (m: AgentMessage): string => {
    const c = m.content
    if (typeof c === 'string') return c.trim()
    return c
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
  }

  const convo =
    `usuário: ${flat(user).slice(0, 900)}` +
    (assistant ? `\nassistente: ${flat(assistant).slice(0, 700)}` : '')

  const r = await bridge().generateTitle(convo)
  const title = r.ok ? r.title : null
  if (!title) return null

  await mutateFolders((st) => ({
    ...st,
    titles: { ...(st.titles ?? {}), [session.id]: title }
  }))
  return title
}

/**
 * Gera título para várias conversas, uma por vez.
 *
 * **Sequencial por necessidade, não por preguiça.** Cada título sobe um
 * `prime-agent --mode rpc` efêmero (ver `src/main/titles.ts`); disparar vinte
 * em paralelo abriria vinte processos do agente na máquina de quem clicou.
 *
 * `onProgress` recebe quantas já foram e o total, para a interface poder dizer
 * onde está em vez de só girar. Falha em uma não interrompe as outras: uma
 * conversa sem mensagem de usuário, ou um arquivo ilegível, não é motivo para
 * abandonar as dezoito restantes.
 *
 * @returns quantas receberam nome.
 */
export async function generateTitlesFor(
  sessions: readonly { id: string; path: string }[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<number> {
  let ok = 0
  for (let i = 0; i < sessions.length; i++) {
    if (signal?.aborted) break
    try {
      if (await generateTitleFor(sessions[i])) ok++
    } catch {
      // Segue para a próxima: ver o comentário acima.
    }
    onProgress?.(i + 1, sessions.length)
  }
  void refreshSessions()
  return ok
}

let titling = false

/**
 * Dá nome à conversa depois do primeiro turno.
 *
 * O nome é gravado com `set_session_name`, então vive no próprio arquivo de
 * sessão (entrada `session_info`) e aparece também no TUI — não é um rótulo
 * paralelo só da GUI.
 */
export async function maybeGenerateTitle(): Promise<void> {
  if (titling) return
  const st = useAgent.getState()
  if (st.state?.sessionName) return

  const msgs = st.messages
  const user = msgs.find((m) => m.role === 'user')
  if (!user) return
  const assistant = msgs.find((m) => m.role === 'assistant')

  titling = true
  try {
    // A resposta entra quando já existe; não é pré-requisito.
    const convo =
      `usuário: ${plainText(user).slice(0, 900)}` +
      (assistant ? `\nassistente: ${plainText(assistant).slice(0, 700)}` : '')

    const r = await bridge().generateTitle(convo)
    const title = r.ok ? r.title : null
    if (!title) return

    await rpc('set_session_name', { name: title })
    await refreshState()
    void refreshSessions()
  } finally {
    titling = false
  }
}
