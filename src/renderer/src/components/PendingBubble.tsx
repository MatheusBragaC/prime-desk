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
    <div className="animate-fade-up px-6 pt-[var(--turn-gap)]">
      {/* Sem avatar, para nascer no mesmo alinhamento da resposta que vai substituí-lo. */}
      <div className="flex">
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
          <span className="text-sm text-dim">{label ?? t('chat.thinking')}…</span>
        </div>
      </div>
    </div>
  )
}
