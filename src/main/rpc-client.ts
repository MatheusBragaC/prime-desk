import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { AgentEvent, RpcResponse } from '../shared/protocol.js'

/**
 * Divide um buffer em registros JSONL.
 *
 * CRÍTICO: o protocolo RPC define LF (\n) como ÚNICO delimitador. Não usar
 * `readline` do Node nem regex unicode: ambos quebram em U+2028/U+2029, que são
 * caracteres válidos DENTRO de strings JSON. Ver docs/MAPEAMENTO.md §2.
 */
export function splitLines(buffer: string): { records: string[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  const records: string[] = []
  for (const part of parts) {
    const line = part.endsWith('\r') ? part.slice(0, -1) : part
    if (line.length > 0) records.push(line)
  }
  return { records, rest }
}

export interface RpcClientOptions {
  cwd: string
  binary?: string
  model?: string
  extraArgs?: string[]
  /** Sobrescreve variáveis de ambiente do processo do agente (ex.: PATH). */
  env?: Record<string, string>
}

interface Pending {
  resolve: (r: RpcResponse) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

const REQUEST_TIMEOUT_MS = 120_000

export class RpcClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutBuf = ''
  private stderrBuf = ''
  private pending = new Map<string, Pending>()
  private closing = false

  constructor(private readonly opts: RpcClientOptions) {
    super()
  }

  get running(): boolean {
    return this.child !== null && !this.child.killed
  }

  start(): void {
    if (this.child) return
    this.closing = false

    const args = ['--mode', 'rpc']
    if (this.opts.model) args.push('--model', this.opts.model)
    if (this.opts.extraArgs) args.push(...this.opts.extraArgs)

    const env = { ...process.env, ...(this.opts.env ?? {}) }
    // A GUI não é um TTY. Cor ANSI no stream poluiria o JSON.
    delete env.FORCE_COLOR
    env.NO_COLOR = '1'

    const child = spawn(this.opts.binary ?? 'prime-agent', args, {
      cwd: this.opts.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams

    this.child = child
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')

    child.stdout.on('data', (chunk: string) => this.onStdout(chunk))

    child.stderr.on('data', (chunk: string) => {
      this.stderrBuf = (this.stderrBuf + chunk).slice(-8000)
      this.emit('stderr', chunk)
    })

    child.on('error', (err) => {
      this.emit('fatal', `Falha ao iniciar o prime-agent: ${err.message}`)
    })

    child.on('exit', (code, signal) => {
      this.child = null
      for (const [, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error('Processo do agente encerrou antes da resposta.'))
      }
      this.pending.clear()
      this.emit('exit', { code, signal, stderr: this.stderrBuf, expected: this.closing })
    })

    this.emit('spawned')
  }

  private onStdout(chunk: string): void {
    const { records, rest } = splitLines(this.stdoutBuf + chunk)
    this.stdoutBuf = rest
    for (const record of records) {
      let parsed: unknown
      try {
        parsed = JSON.parse(record)
      } catch {
        // Linha não-JSON: diagnóstico vazado no stdout. Não derruba o stream.
        this.emit('noise', record)
        continue
      }
      this.dispatch(parsed as RpcResponse | AgentEvent)
    }
  }

  private dispatch(msg: RpcResponse | AgentEvent): void {
    if ((msg as RpcResponse).type === 'response') {
      const res = msg as RpcResponse
      const id = res.id
      if (id && this.pending.has(id)) {
        const p = this.pending.get(id)!
        clearTimeout(p.timer)
        this.pending.delete(id)
        p.resolve(res)
      }
      this.emit('response', res)
      return
    }
    this.emit('event', msg as AgentEvent)
  }

  /** Envia um comando e aguarda o `response` correlacionado por id. */
  send<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<RpcResponse<T>> {
    const child = this.child
    if (!child) return Promise.reject(new Error('Agente não está em execução.'))

    const id = randomUUID()
    const line = JSON.stringify({ ...payload, id, type }) + '\n'

    return new Promise<RpcResponse<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout no comando "${type}".`))
      }, REQUEST_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: resolve as (r: RpcResponse) => void,
        reject,
        timer
      })

      child.stdin.write(line, (err) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  /** Dispara sem aguardar resposta (usado em abort, que precisa furar fila). */
  fire(type: string, payload: Record<string, unknown> = {}): void {
    this.child?.stdin.write(JSON.stringify({ ...payload, type }) + '\n')
  }

  stop(): void {
    this.closing = true
    const child = this.child
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      /* já fechado */
    }
    const killTimer = setTimeout(() => {
      if (this.child) this.child.kill('SIGKILL')
    }, 4000)
    child.once('exit', () => clearTimeout(killTimer))
  }
}
