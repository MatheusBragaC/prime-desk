import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { agentEnv } from './agent-path.js'

/**
 * Motor de transcrição local.
 *
 * O whisper.cpp é compilado na máquina de quem usa, dentro do diretório de
 * dados do app, e o modelo é baixado do HuggingFace. Nada de áudio sai do
 * computador.
 *
 * Não vem empacotado por três motivos: o binário é específico de plataforma e
 * de instruções de CPU, o modelo pesa entre 78 MB e 488 MB, e embutir um
 * compilado de terceiro num app open source obriga a distribuir o que não se
 * construiu. Compilar leva alguns minutos, uma vez só.
 *
 * O preço é exigir ferramentas de build. Por isso a checagem diz exatamente o
 * que falta, em vez de falhar no meio da compilação.
 */

const REPO = 'https://github.com/ggml-org/whisper.cpp'
const MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export interface SpeechModel {
  id: string
  label: string
  /** Tamanho aproximado, para a pessoa decidir antes de baixar. */
  bytes: number
  present: boolean
}

/** Modelos multilíngues. Quanto maior, melhor em português — e mais lento. */
const MODELS: Omit<SpeechModel, 'present'>[] = [
  { id: 'tiny', label: 'Tiny', bytes: 77_691_713 },
  { id: 'base', label: 'Base', bytes: 147_951_465 },
  { id: 'small', label: 'Small', bytes: 487_601_967 }
]

export interface SpeechStatus {
  /** Compilado e com pelo menos um modelo: dá para transcrever. */
  ready: boolean
  dir: string
  /** Caminho do `whisper-server`, quando já compilado. */
  server: string | null
  models: SpeechModel[]
  /** Ferramentas de build ausentes. Vazio = dá para compilar. */
  missing: string[]
}

export function speechDir(): string {
  return join(app.getPath('userData'), 'speech')
}

function serverPath(): string {
  const exe = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server'
  return join(speechDir(), 'whisper.cpp', 'build', 'bin', exe)
}

export function modelPath(id: string): string {
  return join(speechDir(), 'models', `ggml-${id}.bin`)
}

function has(tool: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      process.platform === 'win32' ? 'where' : 'which',
      [tool],
      { timeout: 4000, env: agentEnv() },
      (err) => resolve(!err)
    )
  })
}

/**
 * Modelo baixado pela metade não serve.
 *
 * `curl` interrompido deixa arquivo parcial, e o whisper.cpp só descobre isso
 * ao carregar — erro que apareceria como "transcrição falhou", sem pista. Aqui
 * o tamanho é conferido contra o esperado, com folga para revisão do modelo.
 */
function modelPresent(id: string, expected: number): boolean {
  const path = modelPath(id)
  if (!existsSync(path)) return false
  try {
    return statSync(path).size > expected * 0.95
  } catch {
    return false
  }
}

export async function speechStatus(): Promise<SpeechStatus> {
  const server = existsSync(serverPath()) ? serverPath() : null

  const models = MODELS.map((m) => ({ ...m, present: modelPresent(m.id, m.bytes) }))

  // Só interessa saber o que falta quando ainda há o que compilar.
  const missing: string[] = []
  if (!server) {
    const compiler = process.platform === 'win32' ? 'cl' : 'c++'
    for (const tool of ['git', 'cmake', compiler]) {
      if (!(await has(tool))) missing.push(tool)
    }
  }

  return {
    ready: Boolean(server) && models.some((m) => m.present),
    dir: speechDir(),
    server,
    models,
    missing
  }
}

/**
 * Comando de instalação, para rodar no terminal embutido.
 *
 * Vai como shell script à vista, e não como sequência de `execFile` escondida,
 * porque compilar demora minutos e pode falhar por dependência do sistema — a
 * pessoa precisa ver a saída para saber o que aconteceu. É a mesma decisão do
 * `prime-agent update`.
 *
 * `set -e` para parar no primeiro erro em vez de seguir e falhar mais adiante
 * com uma mensagem sem relação. O clone é raso: o histórico não interessa.
 */
export function speechSetupCommand(modelId: string): string {
  const dir = speechDir()
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[1]

  return [
    'set -e',
    `mkdir -p "${dir}/models"`,
    `cd "${dir}"`,
    `[ -d whisper.cpp ] || git clone --depth 1 ${REPO}`,
    'cd whisper.cpp',
    'cmake -B build -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_SERVER=ON -DWHISPER_BUILD_TESTS=OFF',
    'cmake --build build --config Release -j',
    `[ -f "${dir}/models/ggml-${model.id}.bin" ] || curl -L --fail -o "${dir}/models/ggml-${model.id}.bin" ${MODEL_BASE}/ggml-${model.id}.bin`,
    'echo',
    'echo "Pronto. Feche esta aba e ligue o microfone."'
  ].join(' && ')
}

export async function ensureSpeechDir(): Promise<void> {
  await mkdir(join(speechDir(), 'models'), { recursive: true })
}
