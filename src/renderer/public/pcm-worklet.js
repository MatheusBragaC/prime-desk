/**
 * Coleta PCM do microfone e entrega em blocos.
 *
 * Roda na thread de áudio, não na do renderer: o `ScriptProcessorNode` que este
 * worklet substitui é obsoleto e processa na thread principal, onde um render
 * pesado do React vira falha no áudio.
 *
 * Arquivo estático de propósito. `AudioWorklet.addModule` respeita o
 * `script-src 'self'` do app, então worklet vindo de `blob:` seria bloqueado —
 * e afrouxar o CSP por causa disso não se justifica.
 *
 * A taxa vem do AudioContext, criado a 16 kHz: é o que o Whisper espera, e
 * deixar o navegador reamostrar é melhor do que escrever um reamostrador.
 */

/** ~64 ms a 16 kHz. Bloco pequeno demais inunda a ponte; grande demais atrasa. */
const CHUNK = 1024

class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(CHUNK)
    this.filled = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    // Sem entrada: dispositivo trocando ou faixa encerrada. Seguir vivo.
    if (!channel) return true

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i]
      if (this.filled === CHUNK) {
        // Cópia: o buffer é reaproveitado no próximo quadro.
        const chunk = this.buffer.slice(0)
        this.port.postMessage(chunk, [chunk.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-collector', PcmCollector)
