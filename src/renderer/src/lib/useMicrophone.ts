import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Captação de microfone para ditado.
 *
 * Entrega PCM contínuo em 16 kHz mono — a taxa que o Whisper espera — junto com
 * um nível de volume para a interface mostrar que está ouvindo. Não transcreve:
 * o motor entra por `onChunk`, e trocar de motor não mexe aqui.
 *
 * O nível é medido no sinal cru, antes de qualquer motor: se a pessoa estiver
 * no microfone errado, o medidor mostra silêncio imediatamente, sem esperar
 * transcrição nenhuma.
 */

export interface MicDevice {
  id: string
  label: string
}

export type MicStatus = 'idle' | 'starting' | 'recording' | 'denied' | 'error'

const SAMPLE_RATE = 16000
const PREFERRED_KEY = 'prime-desk:mic'

export interface Microphone {
  status: MicStatus
  error: string | null
  devices: MicDevice[]
  deviceId: string | null
  /** 0 a 1, para medidor. Já suavizado. */
  level: number
  start: () => Promise<void>
  stop: () => void
  chooseDevice: (id: string) => void
  refreshDevices: () => Promise<void>
}

export function useMicrophone(onChunk?: (pcm: Float32Array) => void): Microphone {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MicDevice[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(
    () => localStorage.getItem(PREFERRED_KEY)
  )
  const [level, setLevel] = useState(0)

  const stream = useRef<MediaStream | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const node = useRef<AudioWorkletNode | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const raf = useRef(0)
  const chunkRef = useRef(onChunk)
  chunkRef.current = onChunk

  /**
   * Lista os microfones.
   *
   * Antes de a permissão ser concedida o navegador entrega `label` vazio — é
   * proteção contra impressão digital. Por isso a lista é relida depois do
   * primeiro `getUserMedia`, quando os nomes reais aparecem.
   */
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const mics = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          id: d.deviceId,
          label: d.label || `Microfone ${i + 1}`
        }))
      setDevices(mics)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    // O sistema pode ganhar ou perder microfone com o app aberto.
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current)
    node.current?.port.close()
    node.current?.disconnect()
    analyser.current?.disconnect()
    stream.current?.getTracks().forEach((t) => t.stop())
    void ctx.current?.close()
    node.current = null
    analyser.current = null
    stream.current = null
    ctx.current = null
    setLevel(0)
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (status === 'recording' || status === 'starting') return
    setStatus('starting')
    setError(null)

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      stream.current = media

      // Os rótulos só existem depois do primeiro consentimento.
      void refreshDevices()

      const audio = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctx.current = audio
      await audio.audioWorklet.addModule('/pcm-worklet.js')

      const source = audio.createMediaStreamSource(media)

      const meter = audio.createAnalyser()
      meter.fftSize = 512
      source.connect(meter)
      analyser.current = meter

      const collector = new AudioWorkletNode(audio, 'pcm-collector')
      collector.port.onmessage = (e) => chunkRef.current?.(e.data as Float32Array)
      source.connect(collector)
      node.current = collector

      const data = new Uint8Array(meter.frequencyBinCount)
      const tick = () => {
        meter.getByteTimeDomainData(data)
        // RMS do desvio em torno do silêncio (128), normalizado.
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        // Suaviza para o medidor não tremer; sobe rápido, desce devagar.
        setLevel((prev) => Math.max(rms, prev * 0.85))
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)

      setStatus('recording')
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      // Recusa do usuário ou do sistema tem tratamento próprio: não é falha.
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied')
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
      stop()
      if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
    }
  }, [deviceId, refreshDevices, status, stop])

  const chooseDevice = useCallback((id: string) => {
    setDeviceId(id)
    localStorage.setItem(PREFERRED_KEY, id)
  }, [])

  // Trocar de microfone gravando reinicia a captura no novo dispositivo.
  useEffect(() => {
    if (status !== 'recording') return
    stop()
    void start()
    // Só o dispositivo dispara: incluir `status` faria laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  useEffect(() => stop, [stop])

  return { status, error, devices, deviceId, level, start, stop, chooseDevice, refreshDevices }
}
