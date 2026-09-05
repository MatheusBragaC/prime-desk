import { useCallback, useRef, useState } from 'react'
import { useMicrophone, type Microphone } from './useMicrophone'

/**
 * Ditado ao vivo.
 *
 * O Whisper não é um reconhecedor de fluxo: ele transcreve um trecho fechado.
 * Para o texto aparecer enquanto a pessoa fala, o trecho corrente é
 * retranscrito inteiro a cada poucos segundos e o resultado SUBSTITUI o
 * anterior. Transcrever só o pedaço novo daria fragmentos sem contexto, com
 * pontuação e concordância piores — o modelo usa o que veio antes.
 *
 * Um trecho fecha quando cai o silêncio, ou ao bater o teto de duração. Fechar
 * importa por custo: retranscrever dois minutos a cada dois segundos ficaria
 * lento e esquentaria a máquina à toa.
 */

/** De quanto em quanto tempo o parcial é refeito. */
const REFRESH_MS = 2000
/** Silêncio que fecha o trecho. Menor que isso corta no meio de uma pausa. */
const SILENCE_MS = 900
/** Teto do trecho: acima disso o custo de retranscrever cresce demais. */
const MAX_SEGMENT_S = 25
/** Abaixo disso é ruído de fundo, não fala. */
const SPEECH_RMS = 0.012
const RATE = 16000

export interface Dictation {
  mic: Microphone
  /** Texto do trecho em curso, ainda sendo refinado. */
  partial: string
  /** Transcrevendo agora. */
  working: boolean
  error: string | null
  start: (modelId: string) => Promise<boolean>
  stop: () => Promise<void>
}

export function useDictation(onFinal: (text: string) => void, onPartial: (text: string) => void): Dictation {
  const [partial, setPartial] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const segment = useRef<Float32Array[]>([])
  const total = useRef(0)
  const lastVoiceAt = useRef(0)
  const lastRunAt = useRef(0)
  const busy = useRef(false)
  const active = useRef(false)
  const finalRef = useRef(onFinal)
  const partialRef = useRef(onPartial)
  finalRef.current = onFinal
  partialRef.current = onPartial

  const flatten = useCallback((): Float32Array => {
    const out = new Float32Array(total.current)
    let at = 0
    for (const c of segment.current) {
      out.set(c, at)
      at += c.length
    }
    return out
  }, [])

  const reset = useCallback(() => {
    segment.current = []
    total.current = 0
    setPartial('')
  }, [])

  /** Transcreve o trecho corrente. `close` grava o texto de vez. */
  const run = useCallback(async (close: boolean) => {
    if (busy.current || total.current < RATE * 0.4) {
      // Menos de 0,4 s não dá palavra; fechar aqui só descartaria o trecho.
      if (close) reset()
      return
    }
    busy.current = true
    setWorking(true)
    const audio = flatten()

    try {
      const r = await window.prime.speechTranscribe(audio)
      if (!r?.ok) {
        setError((r?.error as string) ?? null)
      } else {
        const text = ((r.text as string) ?? '').trim()
        setError(null)
        if (close) {
          if (text) finalRef.current(text)
          reset()
        } else if (text) {
          setPartial(text)
          partialRef.current(text)
        }
      }
    } finally {
      busy.current = false
      setWorking(false)
      lastRunAt.current = Date.now()
    }
  }, [flatten, reset])

  const onChunk = useCallback((pcm: Float32Array) => {
    if (!active.current) return

    let sum = 0
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
    const rms = Math.sqrt(sum / pcm.length)
    const now = Date.now()

    // Silêncio antes de qualquer fala não vira trecho: evita transcrever o
    // nada enquanto a pessoa pensa no que dizer.
    if (rms < SPEECH_RMS && total.current === 0) return

    if (rms >= SPEECH_RMS) lastVoiceAt.current = now

    segment.current.push(pcm)
    total.current += pcm.length

    const seconds = total.current / RATE
    const quiet = now - lastVoiceAt.current

    if (quiet > SILENCE_MS || seconds >= MAX_SEGMENT_S) {
      void run(true)
      return
    }
    if (now - lastRunAt.current > REFRESH_MS) void run(false)
  }, [run])

  const mic = useMicrophone(onChunk)

  const start = useCallback(async (modelId: string) => {
    setError(null)
    // O modelo demora a carregar; subir antes de captar evita perder o começo
    // da fala enquanto o servidor ainda está de pé.
    const up = await window.prime.speechStart(modelId)
    if (!up?.ok) {
      setError((up?.error as string) ?? null)
      return false
    }
    reset()
    lastVoiceAt.current = Date.now()
    lastRunAt.current = Date.now()
    active.current = true
    await mic.start()
    return true
  }, [mic, reset])

  const stop = useCallback(async () => {
    active.current = false
    mic.stop()
    // Fecha o que sobrou: sem isso a última frase ficaria só como parcial.
    await run(true)
    await window.prime.speechStop()
  }, [mic, run])

  return { mic, partial, working, error, start, stop }
}
