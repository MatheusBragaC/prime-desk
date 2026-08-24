import { Butterfly } from './Butterfly'
import { useT } from '../i18n'

/**
 * Sinal de atividade enquanto a resposta ainda não começou a chegar.
 *
 * Sem isso, entre enviar a mensagem e o primeiro token o usuário só tinha o
 * "Executando" no topo da janela — longe de onde ele está olhando. Este bloco
 * ocupa o lugar exato onde a resposta vai nascer.
 */
export function PendingBubble({ label }: { label?: string }) {
  const { t } = useT()

  return (
    <div className="animate-fade-up px-6 pb-1.5 pt-2.5">
      <div className="flex gap-3.5">
        <div className="mt-0.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.07] bg-surface">
            <Butterfly size={17} className="animate-pulse-soft" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 pt-1">
          <span className="flex items-end gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-[5px] w-[5px] rounded-full bg-primarySoft"
                style={{
                  animation: 'pulse-soft 1.1s ease-in-out infinite',
                  animationDelay: `${i * 0.16}s`
                }}
              />
            ))}
          </span>
          <span className="text-[12.5px] text-dim">{label ?? t('chat.thinking')}…</span>
        </div>
      </div>
    </div>
  )
}
