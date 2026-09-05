import { useRef, useState } from 'react'
import { Mic, MicOff, ChevronDown, Check, Loader2 } from 'lucide-react'
import { useMicrophone } from '../lib/useMicrophone'
import { usePopover } from '../lib/usePopover'
import { useAgent } from '../store/agent'
import { useT } from '../i18n'

/**
 * Ditado por voz no composer.
 *
 * O botão liga a captação; o seletor ao lado lista todos os microfones que o
 * sistema expõe. A transcrição ainda não tem motor — a captação foi construída
 * primeiro porque é idêntica em qualquer um deles, e trocar o motor depois não
 * mexe neste componente.
 *
 * Enquanto não há motor, o botão grava e mede nível mas avisa que não
 * transcreve. Mostrar um microfone que não faz nada seria pior.
 */

/** Barras que sobem com a voz. Dá sinal de vida mesmo em silêncio absoluto. */
function LevelMeter({ level }: { level: number }) {
  const bars = [0.25, 0.55, 0.85, 0.55, 0.25]
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {bars.map((peak, i) => {
        // Cada barra tem um limiar próprio: dá forma de onda, não bloco.
        const h = Math.min(1, Math.max(0.15, (level / peak) * 0.9))
        return (
          <span
            key={i}
            style={{ height: `${h * 12}px` }}
            className="w-[2px] rounded-full bg-primary transition-[height] duration-75"
          />
        )
      })}
    </span>
  )
}

export function MicButton({ onTranscript }: {
  /** Recebe o texto reconhecido. Sem motor, ainda não é chamado. */
  onTranscript?: (text: string) => void
}) {
  const { t } = useT()
  const notify = useAgent((s) => s.notify)
  const [menu, setMenu] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const menuRef = usePopover<HTMLDivElement>(() => setMenu(false), menu, menuBtn)

  const mic = useMicrophone(() => {
    // Aqui entra o motor: blocos de PCM 16 kHz mono chegam continuamente.
    // Enquanto não existe, os blocos são descartados de propósito.
    void onTranscript
  })

  const recording = mic.status === 'recording'
  const busy = mic.status === 'starting'

  function toggle() {
    if (recording) {
      mic.stop()
      return
    }
    void mic.start().then(() => {
      // Aviso uma vez por sessão de gravação, não a cada bloco.
      notify('info', t('mic.noEngine'))
    })
  }

  const label =
    mic.status === 'denied' ? t('mic.denied')
    : recording ? t('mic.stop')
    : t('mic.start')

  return (
    <div className="relative flex items-center">
      <button
        onClick={toggle}
        disabled={busy}
        title={label}
        className={
          'flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors disabled:opacity-40 ' +
          (recording
            ? 'bg-primary/15 text-primarySoft'
            : mic.status === 'denied'
              ? 'text-err hover:bg-elevated'
              : 'text-dim hover:bg-elevated hover:text-muted')
        }
      >
        {busy ? (
          <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />
        ) : mic.status === 'denied' ? (
          <MicOff size={15} strokeWidth={1.75} />
        ) : (
          <Mic size={15} strokeWidth={1.75} />
        )}
        {recording && <LevelMeter level={mic.level} />}
      </button>

      <button
        ref={menuBtn}
        onClick={() => {
          setMenu((v) => !v)
          void mic.refreshDevices()
        }}
        title={t('mic.devices')}
        className="rounded-md p-0.5 text-dim transition-colors hover:bg-elevated hover:text-muted"
      >
        <ChevronDown size={13} strokeWidth={1.75} />
      </button>

      {menu && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 z-dropdown mb-2 max-h-[260px] w-[280px] overflow-y-auto animate-fade-up rounded-lg border border-white/[0.1] bg-[var(--p-panel)] p-1 shadow-2xl shadow-black/70"
        >
          <div className="px-2 py-1 text-micro uppercase tracking-wider text-dim">
            {t('mic.devices')}
          </div>

          {mic.devices.length === 0 && (
            <div className="px-2 py-2 text-xs text-dim">{t('mic.none')}</div>
          )}

          {mic.devices.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                mic.chooseDevice(d.id)
                setMenu(false)
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
            >
              <Mic size={13} strokeWidth={1.75} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={d.label}>{d.label}</span>
              {mic.deviceId === d.id && (
                <Check size={13} strokeWidth={1.75} className="shrink-0 text-primarySoft" />
              )}
            </button>
          ))}

          {mic.error && (
            <div className="mt-1 border-t border-[var(--p-line)] px-2 pt-1.5 text-micro leading-snug text-err">
              {mic.error}
            </div>
          )}

          <p className="mt-1 border-t border-[var(--p-line)] px-2 pt-1.5 text-micro leading-snug text-dim">
            {t('mic.hint')}
          </p>
        </div>
      )}
    </div>
  )
}
