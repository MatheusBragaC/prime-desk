import { useState } from 'react'
import type { SessionSummary } from '../../../shared/protocol'
import { useAgent, generateTitlesFor } from '../store/agent'
import { useT } from '../i18n'

/** `null` fora do lote; `{ done, total }` durante. */
export type TitlingProgress = { done: number; total: number } | null

/**
 * Lote de geração de títulos: confirmação, progresso e limpeza no fim.
 *
 * Ficava dentro da `Sidebar`, que assim era dona de um processo de minutos
 * além de desenhar a lista. O progresso é lido por dois pontos da UI (o botão
 * da barra de ações e a linha de progresso), então precisa de um dono só.
 */
export function useTitleBatch(untitled: SessionSummary[]): {
  titling: TitlingProgress
  run: () => void
} {
  const { t } = useT()
  const [titling, setTitling] = useState<TitlingProgress>(null)

  function run(): void {
    const alvo = untitled
    if (alvo.length === 0) return
    useAgent.getState().requestConfirm({
      title: t('sidebar.titleAllTitle'),
      message: t('sidebar.titleAllMsg', { n: alvo.length }),
      detail: t('sidebar.titleAllWarn'),
      confirmLabel: t('sidebar.titleAllConfirm'),
      /*
        Sem `await` aqui de propósito. O ConfirmDialog espera o `onConfirm` e
        fica em estado ocupado até resolver — certo para confirmação curta,
        errado para um lote de vinte conversas: o diálogo ficava travado em
        "processando" por minutos, com o véu bloqueando a janela inteira,
        enquanto o progresso já corria na sidebar atrás dele. Aqui o diálogo
        fecha na hora e quem acompanha é a linha de progresso.
      */
      onConfirm: () => {
        setTitling({ done: 0, total: alvo.length })
        void generateTitlesFor(alvo, (done, total) => setTitling({ done, total }))
          .catch(() => undefined)
          .finally(() => setTitling(null))
      }
    })
  }

  return { titling, run }
}
