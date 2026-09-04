/**
 * Checagem de versão nova do prime-agent.
 *
 * A fonte é o manifesto do próprio agente, não o registro do npm. Isso importa
 * por dois motivos: o agente pode ter sido instalado por fora do npm, e o
 * manifesto acompanha o canal (estável ou beta) da instalação. O `update` do
 * agente lê exatamente daqui, então a GUI e o CLI nunca discordam.
 *
 * Nada aqui baixa ou instala — só compara números. A instalação roda no
 * terminal embutido, à vista do usuário.
 */

const DEFAULT_BASE = 'https://pub-728493de92a943e2a9b2d17b4719f318.r2.dev'

/** Manifesto: `{ package, version, tarball, tarballs[] }`. Só a versão interessa. */
interface Manifest {
  version?: string
  package?: string
}

export interface UpdateCheck {
  current: string | null
  latest: string | null
  available: boolean
  /** Por que não checou. Não é erro: é estado esperado. */
  skipped?: 'offline' | 'disabled' | 'unknown-version'
  error?: string
}

/**
 * Compara duas versões semver.
 *
 * O manifesto devolve com prefixo (`v0.9.1`) e o `--version` do binário sem
 * (`0.8.0`) — comparar as strings cruas diria que a instalada é maior.
 * Devolve >0 quando `a` é mais nova.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ''] = v.replace(/^v/, '').split('-')
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0)
    return { nums, pre }
  }
  const x = parse(a)
  const y = parse(b)

  for (let i = 0; i < 3; i++) {
    const diff = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (diff !== 0) return diff
  }

  // Sem prerelease ganha de com prerelease: 1.0.0 é mais nova que 1.0.0-beta1.
  if (!x.pre && y.pre) return 1
  if (x.pre && !y.pre) return -1
  return x.pre.localeCompare(y.pre)
}

/** Estável ou beta, decidido pela versão instalada. */
function manifestFor(current: string): string {
  return /-beta/i.test(current) ? 'beta.json' : 'latest.json'
}

let cache: { at: number; result: UpdateCheck } | null = null
const CACHE_MS = 6 * 60 * 60 * 1000

export async function checkAgentUpdate(current: string | null): Promise<UpdateCheck> {
  // As mesmas chaves que desligam a checagem do próprio agente.
  if (process.env.PI_OFFLINE) return { current, latest: null, available: false, skipped: 'offline' }
  if (process.env.PI_SKIP_VERSION_CHECK) {
    return { current, latest: null, available: false, skipped: 'disabled' }
  }
  if (!current) return { current, latest: null, available: false, skipped: 'unknown-version' }

  if (cache && Date.now() - cache.at < CACHE_MS && cache.result.current === current) {
    return cache.result
  }

  const base = (process.env.PRIME_AGENT_DOWNLOAD_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, '')

  try {
    const res = await fetch(`${base}/${manifestFor(current)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const manifest = (await res.json()) as Manifest
    const latest = manifest.version ?? null
    const result: UpdateCheck = {
      current,
      latest,
      available: Boolean(latest && compareVersions(latest, current) > 0)
    }
    cache = { at: Date.now(), result }
    return result
  } catch (err) {
    /*
      Falha de rede aqui não é problema do usuário: o `fetch` do Node ignora
      proxy do sistema, então em rede corporativa isso erra sempre. Devolve o
      erro para quem quiser depurar, mas `available: false` mantém a UI quieta.
    */
    return {
      current,
      latest: null,
      available: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
