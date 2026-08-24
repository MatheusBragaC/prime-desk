import { execFile, spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

/**
 * Verificação de ambiente para a primeira execução.
 *
 * O Prime Desk não tem conta própria: ele depende do `prime-agent` instalado e
 * autenticado. Este módulo só **detecta** e **orienta** — nunca lê o conteúdo
 * de credenciais. De `auth.json` extraímos apenas os nomes dos provedores.
 */

export interface EnvStatus {
  agent: { installed: boolean; path: string | null; version: string | null }
  auth: { ok: boolean; providers: string[]; envKeys: string[] }
}

/** Variáveis reconhecidas pelo prime-agent, conforme docs/providers.md. */
const ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'DEEPSEEK_API_KEY', 'CEREBRAS_API_KEY', 'FIREWORKS_API_KEY', 'KIMI_API_KEY',
  'MINIMAX_API_KEY', 'AZURE_OPENAI_API_KEY', 'CLOUDFLARE_API_KEY',
  'AI_GATEWAY_API_KEY', 'PRIME_API_KEY', 'XAI_API_KEY', 'MISTRAL_API_KEY'
]

function run(cmd: string, args: string[], timeout = 8000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
      resolve({ code: err ? 1 : 0, out: `${stdout}${stderr}`.trim() })
    })
  })
}

export async function checkEnvironment(): Promise<EnvStatus> {
  const which = await run('which', ['prime-agent'], 5000)
  const path = which.code === 0 && which.out ? which.out.split('\n')[0] : null

  let version: string | null = null
  if (path) {
    // `--version` escreve no stderr, então lemos os dois fluxos.
    const v = await run(path, ['--version'], 15000)
    const m = v.out.match(/\d+\.\d+\.\d+[^\s]*/)
    version = m ? m[0] : null
  }

  let providers: string[] = []
  try {
    const raw = await readFile(join(homedir(), '.prime', 'agent', 'auth.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // Só os nomes das chaves. Nenhum valor sai daqui.
    providers = Object.keys(parsed).filter((k) => parsed[k] && typeof parsed[k] === 'object')
  } catch {
    providers = []
  }

  const envKeys = ENV_KEYS.filter((k) => (process.env[k] ?? '').trim().length > 0)

  return {
    agent: { installed: Boolean(path), path, version },
    auth: { ok: providers.length > 0 || envKeys.length > 0, providers, envKeys }
  }
}

/** Comando oficial de instalação, exibido ao usuário antes de rodar. */
export const INSTALL_COMMAND =
  'curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh | sh'

/**
 * Executa o instalador oficial, transmitindo a saída linha a linha.
 * Nunca roda sozinho: só a partir de ação explícita, com o comando à vista.
 */
export function installAgent(onData: (chunk: string) => void): Promise<{ ok: boolean; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', INSTALL_COMMAND], {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (e) => {
      onData(`\nFalha ao iniciar o instalador: ${e.message}\n`)
      resolve({ ok: false, code: 1 })
    })
    child.on('close', (code) => resolve({ ok: code === 0, code: code ?? 1 }))
  })
}

/**
 * Abre um terminal do sistema já rodando o `prime-agent`.
 *
 * O `/login` é um fluxo interativo (OAuth no navegador, seleção no TUI) que não
 * cabe dentro da GUI. Em vez de imitá-lo pela metade, entregamos o terminal
 * pronto no lugar certo.
 */
export async function openAgentTerminal(): Promise<{ ok: boolean; error?: string }> {
  const os = platform()

  if (os === 'darwin') {
    const child = spawn('open', ['-a', 'Terminal', join(homedir())], { detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true }
  }

  const candidates: [string, string[]][] = [
    ['gnome-terminal', ['--', 'bash', '-lc', 'prime-agent; exec bash']],
    ['konsole', ['-e', 'bash', '-lc', 'prime-agent; exec bash']],
    ['xfce4-terminal', ['-e', 'bash -lc "prime-agent; exec bash"']],
    ['x-terminal-emulator', ['-e', 'bash', '-lc', 'prime-agent; exec bash']],
    ['xterm', ['-e', 'bash', '-lc', 'prime-agent; exec bash']]
  ]

  for (const [bin, args] of candidates) {
    const found = await run('which', [bin], 4000)
    if (found.code !== 0) continue
    const child = spawn(bin, args, { detached: true, stdio: 'ignore', cwd: homedir() })
    child.unref()
    return { ok: true }
  }

  return { ok: false, error: 'Nenhum terminal encontrado. Abra um manualmente e rode: prime-agent' }
}


/**
 * Remove as credenciais de um provedor — equivalente ao `/logout` do agente,
 * que a doc descreve como "clear credentials" em `~/.prime/agent/auth.json`.
 *
 * Esta é a **única** operação em que o Prime Desk escreve nesse arquivo, e
 * mesmo aqui ele não lê valor nenhum: apenas remove a chave do provedor pedido
 * e regrava o restante intacto.
 */
export async function logoutProvider(provider: string): Promise<{ ok: boolean; error?: string }> {
  const file = join(homedir(), '.prime', 'agent', 'auth.json')
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!(provider in parsed)) return { ok: false, error: 'Provedor não encontrado.' }
    delete parsed[provider]
    await writeFile(file, JSON.stringify(parsed, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
