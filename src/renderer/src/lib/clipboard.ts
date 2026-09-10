import { useAgent } from '@/store/agent'

/**
 * Copiar texto, por um caminho que não falha calado.
 *
 * Passa pelo processo main (`clipboard:write`) em vez do `navigator.clipboard`:
 * o handler de permissões da janela libera só `media`, e a Async Clipboard API
 * pede `clipboard-sanitized-write`. Os três botões de copiar do app ficaram
 * quebrados por isso — e sem nenhum aviso, porque a promessa rejeitada era
 * descartada com `void`.
 *
 * Aqui a falha vira aviso na tela. Um botão de copiar que não copia e não diz
 * nada é pior que a ausência dele: a pessoa cola o conteúdo antigo sem perceber.
 */
export async function copyText(text: string, failMessage: string): Promise<boolean> {
  try {
    const r = await window.prime.copyText(text)
    if (r?.ok) return true
    useAgent.getState().notify('error', r?.error ?? failMessage)
    return false
  } catch (e) {
    useAgent.getState().notify('error', e instanceof Error ? e.message : failMessage)
    return false
  }
}
