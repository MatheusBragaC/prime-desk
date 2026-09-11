import { Clock, Square, Bot } from '@/icons'
import { useAgent, abortTurn } from '@/store/agent'
import { useTurnActivity } from '@/lib/useTurnActivity'
import { summary } from '@/lib/toolSummary'
import { fmtElapsed } from '@/lib/format'
import { useT } from '@/i18n'

/**
 * Aviso de turno silencioso, acima do composer.
 *
 * Fica onde o olho já está quando a pessoa se pergunta se travou: em cima da
 * caixa de texto, junto dos chips de contexto. Não é `Notice` porque não é
 * evento — é estado, e desaparece sozinho quando o turno volta a andar.
 *
 * Traz três informações, e a terceira é a que faltava: quanto tempo, em que
 * chamada, e **quantas mensagens estão presas na fila por causa disso**. Num
 * caso real os relatórios de três subagentes ficaram esperando duas horas o
 * turno do pai terminar, e nada na tela ligava uma coisa à outra.
 *
 * A copy não diz "travado". Build e teste demoram de verdade; afirmar defeito
 * com base só no relógio seria mentir metade das vezes. Diz o tempo, mostra o
 * que está rodando, e deixa o botão de interromper à mão.
 */

export function StalledTurnNotice() {
  const { t } = useT()
  const { stall } = useTurnActivity()
  const actions = useAgent((s) => s.state?.sessionActions)

  if (!stall) return null

  const queued = actions?.queuedCount ?? 0
  const label =
    stall.kind === 'tool' && stall.tool
      ? summary(stall.tool.name, stall.tool.args)
      : t('stall.noSignal')

  return (
    <div className="mx-3 mb-1.5 flex items-center gap-2 rounded-field border border-warn/25 bg-warn/[0.06] px-2.5 py-1.5 animate-fade-up">
      <Clock size={13} className="shrink-0 text-warn" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-fg">
          {t('stall.running', { time: fmtElapsed(stall.ms) })}
          <span className="ml-1 font-mono text-dim">{label}</span>
        </div>

        {queued > 0 && (
          <div className="mt-0.5 flex items-center gap-1 text-micro text-warn">
            <Bot size={10} className="shrink-0" />
            {t('stall.queueBlocked', { n: queued })}
          </div>
        )}
      </div>

      <button
        onClick={() => void abortTurn()}
        className="no-drag flex shrink-0 items-center gap-1 rounded-md border border-[var(--p-line)] px-2 py-1 text-micro text-muted transition-colors hover:bg-elevated hover:text-fg"
        title={t('stall.abortHint')}
      >
        <Square size={9} strokeWidth={2.5} className="shrink-0" />
        {t('composer.stop')}
      </button>
    </div>
  )
}
