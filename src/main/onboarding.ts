import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile, writeFile, rename, stat, unlink } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
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
export async function openAgentTerminal(): Promise<{ ok: boolean; error?: string; command: string }> {
  const os = platform()
  const COMMAND = 'prime-agent'

  if (os === 'darwin') {
    const script = `tell application "Terminal" to do script "${COMMAND}"\ntell application "Terminal" to activate`
    const started = await trySpawn('osascript', ['-e', script])
    return { ...started, command: COMMAND }
  }

  const inner = `${COMMAND}; exec bash`

  /**
   * `--disable-factory` no gnome-terminal é deliberado: sem ele, o cliente fala
   * com o servidor por D-Bus e, quando esse canal está degradado, falha com
   * "Failed to get screen from object path" — e ainda assim sai com código 0.
   * Com a flag, o processo abre a própria janela e o erro deixa de existir.
   */
  const candidates: [string, string[]][] = [
    ['gnome-terminal', ['--disable-factory', '--', 'bash', '-lc', inner]],
    ['ptyxis', ['--', 'bash', '-lc', inner]],
    ['konsole', ['-e', 'bash', '-lc', inner]],
    ['xfce4-terminal', ['--disable-server', '-e', `bash -lc "${inner}"`]],
    ['kitty', ['bash', '-lc', inner]],
    ['alacritty', ['-e', 'bash', '-lc', inner]],
    ['xterm', ['-e', 'bash', '-lc', inner]],
    ['x-terminal-emulator', ['-e', 'bash', '-lc', inner]]
  ]

  const errors: string[] = []
  for (const [bin, args] of candidates) {
    const found = await run('which', [bin], 4000)
    if (found.code !== 0) continue
    const started = await trySpawn(bin, args)
    if (started.ok) return { ok: true, command: COMMAND }
    errors.push(`${bin}: ${started.error ?? 'falhou'}`)
  }

  return {
    ok: false,
    command: COMMAND,
    error: errors.length
      ? `Não foi possível abrir um terminal. ${errors[0]}`
      : 'Nenhum terminal encontrado no sistema.'
  }
}

/**
 * Lança um terminal e confirma que ele realmente abriu.
 *
 * Emuladores de terminal costumam sair com código 0 mesmo quando falham, então
 * código de saída não serve de prova. Observamos a saída de erro por um instante
 * e tratamos qualquer mensagem de erro como falha, para poder tentar o próximo.
 */
function trySpawn(bin: string, args: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: homedir() })
    } catch (e) {
      return resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }

    let stderr = ''
    let settled = false
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (d: string) => {
      stderr += d
    })
    child.on('error', (e) => finish({ ok: false, error: e.message }))
    child.on('exit', (code) => {
      if (code && code !== 0) finish({ ok: false, error: stderr.trim().split('\n')[0] || `código ${code}` })
    })

    setTimeout(() => {
      const failed = /error|failed|cannot|unable/i.test(stderr)
      if (failed) finish({ ok: false, error: stderr.trim().split('\n')[0] })
      else {
        child.unref()
        finish({ ok: true })
      }
    }, 1400)
  })
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
  const tmp = `${file}.prime-desk-${process.pid}.tmp`
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // `in` acharia chave herdada do protótipo ("toString"): só a própria conta.
    if (!Object.prototype.hasOwnProperty.call(parsed, provider)) {
      return { ok: false, error: 'Provedor não encontrado.' }
    }
    delete parsed[provider]

    /**
     * Grava por arquivo temporário + rename.
     *
     * São credenciais: um crash no meio de um `writeFile` direto deixaria o
     * arquivo truncado e derrubaria o login de TODOS os provedores, não só o do
     * logout pedido. O rename é atômico dentro do mesmo diretório, e o modo do
     * arquivo original é preservado para não afrouxar a permissão.
     */
    const mode = (await stat(file)).mode & 0o777
    await writeFile(tmp, JSON.stringify(parsed, null, 2), { encoding: 'utf-8', mode })
    await rename(tmp, file)
    return { ok: true }
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}


/** Porta do callback OAuth do prime-agent (`CALLBACK_PORT` no bundle). */
const OAUTH_CALLBACK_PORT = 53692

/**
 * Verifica se a porta do callback OAuth está livre.
 *
 * Um `prime-agent` que iniciou um login e ficou esperando o retorno do navegador
 * mantém essa porta presa. Qualquer nova tentativa de login — nele ou em outra
 * janela — falha ao dar bind e o TUI **não mostra nada**: a tela simplesmente
 * não reage ao Enter. Detectar isso antes evita um beco sem saída silencioso.
 */
export function checkLoginPort(): Promise<{ free: boolean; port: number }> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve({ free: false, port: OAUTH_CALLBACK_PORT }))
    server.once('listening', () => {
      server.close(() => resolve({ free: true, port: OAUTH_CALLBACK_PORT }))
    })
    server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1')
  })
}


// ------------------------------------------------------- observação do ambiente

/**
 * Leitura leve: só credenciais, sem tocar em `which` nem `--version`.
 * É o que roda em laço, então precisa ser barato.
 */
async function readAuthOnly(): Promise<EnvStatus['auth']> {
  let providers: string[] = []
  try {
    const raw = await readFile(join(homedir(), '.prime', 'agent', 'auth.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    providers = Object.keys(parsed).filter((k) => parsed[k] && typeof parsed[k] === 'object')
  } catch {
    providers = []
  }
  const envKeys = ENV_KEYS.filter((k) => (process.env[k] ?? '').trim().length > 0)
  return { ok: providers.length > 0 || envKeys.length > 0, providers, envKeys }
}

let watcher: FSWatcher | null = null
let poll: NodeJS.Timeout | null = null
let debounce: NodeJS.Timeout | null = null
let lastSignature = ''

/**
 * Avisa quando o ambiente muda — em especial, quando o `/login` termina.
 *
 * Combina duas fontes porque nenhuma sozinha é confiável: `fs.watch` no
 * diretório (o arquivo é regravado, não editado no lugar, então observar o
 * arquivo direto perde o evento) e um laço lento como rede de segurança, já que
 * `fs.watch` não é garantido em todo sistema de arquivos.
 *
 * Só emite quando o estado realmente muda, para não inundar o renderer.
 */
export function startEnvWatch(onChange: (status: EnvStatus) => void): void {
  stopEnvWatch()

  const emit = async (): Promise<void> => {
    const auth = await readAuthOnly()
    const signature = `${auth.ok}|${auth.providers.join(',')}|${auth.envKeys.join(',')}`
    if (signature === lastSignature) return
    lastSignature = signature

    // Estado completo (inclui versão do binário) só quando algo mudou de fato.
    onChange(await checkEnvironment())
  }

  const schedule = (): void => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => void emit(), 400)
  }

  try {
    watcher = watch(join(homedir(), '.prime', 'agent'), { persistent: false }, (_event, file) => {
      if (!file || String(file).startsWith('auth.json')) schedule()
    })
    watcher.on('error', () => {
      /* o laço abaixo cobre */
    })
  } catch {
    watcher = null
  }

  poll = setInterval(() => void emit(), 3000)
  void emit()
}

export function stopEnvWatch(): void {
  watcher?.close()
  watcher = null
  if (poll) clearInterval(poll)
  poll = null
  if (debounce) clearTimeout(debounce)
  debounce = null
  lastSignature = ''
}
