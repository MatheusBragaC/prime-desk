import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { speechStatus, modelPath } from './speech.js'
import { agentEnv } from './agent-path.js'

/**
 * Servidor local do whisper.cpp.
 *
 * Um processo por sessão de ditado, não um por trecho de áudio: carregar o
 * modelo custa segundos e centenas de megabytes, e refazer isso a cada janela
 * de fala tornaria a transcrição ao vivo impossível. O processo sobe ao ligar o
 * microfone e cai ao desligar.
 *
 * Fala só com 127.0.0.1, numa porta efêmera. O áudio não sai da máquina.
 */

let proc: ChildProcess | null = null
let port = 0
let ready: Promise<void> | null = null
let currentModel = ''

/** Porta livre pedida ao sistema. Há corrida entre fechar e o servidor subir,
 *  mas é a forma portátil — o whisper-server não sabe escolher sozinho. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const p = typeof address === 'object' && address ? address.port : 0
      probe.close(() => (p ? resolve(p) : reject(new Error('sem porta livre'))))
    })
  })
}

async function waitUntilUp(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!proc || proc.exitCode !== null) throw new Error('O servidor de voz encerrou ao iniciar.')
    try {
      // Qualquer resposta serve: só interessa saber se já aceita conexão.
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  throw new Error('O servidor de voz não respondeu a tempo.')
}

export async function startSpeech(modelId: string): Promise<{ ok: boolean; error?: string }> {
  if (proc && currentModel === modelId) {
    try {
      await ready
      return { ok: true }
    } catch (e) {
      // Tentativa anterior falhou: derruba e tenta de novo do zero.
      stopSpeech()
    }
  }
  stopSpeech()

  const status = await speechStatus()
  if (!status.server) return { ok: false, error: 'Motor de transcrição não instalado.' }
  const model = status.models.find((m) => m.id === modelId && m.present)
  if (!model) return { ok: false, error: `Modelo "${modelId}" não está baixado.` }

  try {
    port = await freePort()
    currentModel = modelId
    proc = spawn(
      status.server,
      [
        '--model', modelPath(modelId),
        '--host', '127.0.0.1',
        '--port', String(port),
        // Sem tradução: ditado em português tem que sair em português.
        '--language', 'auto'
      ],
      { env: agentEnv(), stdio: ['ignore', 'pipe', 'pipe'] }
    )

    proc.on('exit', () => {
      proc = null
      ready = null
    })

    ready = waitUntilUp()
    await ready
    return { ok: true }
  } catch (e) {
    stopSpeech()
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function stopSpeech(): void {
  if (proc) {
    proc.removeAllListeners('exit')
    try {
      proc.kill()
    } catch {
      // Já morreu.
    }
  }
  proc = null
  ready = null
  currentModel = ''
}

/**
 * Float32 mono em WAV PCM 16 bits.
 *
 * O `/inference` do whisper-server recebe arquivo, não amostras cruas. Montar o
 * cabeçalho aqui evita depender de biblioteca de áudio para 44 bytes.
 */
export function toWav(samples: Float32Array, sampleRate = 16000): Buffer {
  const bytes = samples.length * 2
  const buf = Buffer.alloc(44 + bytes)

  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + bytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // tamanho do bloco fmt
  buf.writeUInt16LE(1, 20) // PCM sem compressão
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // bytes por segundo
  buf.writeUInt16LE(2, 32) // alinhamento de bloco
  buf.writeUInt16LE(16, 34) // bits por amostra
  buf.write('data', 36)
  buf.writeUInt32LE(bytes, 40)

  for (let i = 0; i < samples.length; i++) {
    // Satura em vez de dar a volta: pico estourado vira clique, não ruído.
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  return buf
}

export async function transcribe(
  samples: Float32Array
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!proc) return { ok: false, error: 'O servidor de voz não está em execução.' }

  try {
    await ready
    const form = new FormData()
    // `new Uint8Array(...)` porque o Blob do Node não aceita Buffer direto.
    const wav = toWav(samples)
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
    form.append('response_format', 'json')
    form.append('temperature', '0')

    const res = await fetch(`http://127.0.0.1:${port}/inference`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000)
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }

    const data = (await res.json()) as { text?: string }
    return { ok: true, text: (data.text ?? '').trim() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
