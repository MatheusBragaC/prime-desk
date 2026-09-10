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

import type { UpdateCheck } from '../shared/protocol.js'

const DEFAULT_BASE = 'https://pub-728493de92a943e2a9b2d17b4719f318.r2.dev'

/** Manifesto: `{ package, version, tarball, tarballs[] }`. Só a versão interessa. */
interface Manifest {
  version?: string
  package?: string
}

// Reexportado de shared/protocol: é contrato com o renderer, não detalhe do main.
export type { UpdateCheck }

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

/*
  ---------------------------------------------------------------- o próprio app

  Mesmo desenho da checagem do agente, e de propósito: comparar número aqui,
  instalar no terminal embutido, à vista de quem clicou.

  **Não é `electron-updater`**, e isso é decisão, não falta. Dois fatos da
  plataforma matam o autoupdate silencioso neste projeto: no Linux o
  `electron-updater` só auto-instala AppImage, não `.deb` — trocar arquivo em
  `/opt` exige root —, e o `.deb` é o caminho certo aqui porque o AppImage no
  Ubuntu 24.04+ só abre com `--no-sandbox` (ver `docs/MAPEAMENTO.md` §29). No
  macOS, build sem assinatura não auto-atualiza: o Squirrel exige assinatura.

  A fonte é o `releases/latest` do GitHub, o MESMO que o `scripts/install.sh`
  consome — assim o app e o instalador nunca discordam sobre o que é "a última".
*/

const RELEASES_API = 'https://api.github.com/repos/MatheusBragaC/prime-desk/releases/latest'

let appCache: { at: number; result: UpdateCheck } | null = null

interface GithubRelease {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
}

/**
 * A versão que o release anuncia, ou `null` se ele não serve.
 *
 * Fora do `fetch` de propósito: é a única decisão desta checagem que dá para
 * testar sem rede. Rascunho e prerelease não contam — quem só quer usar o app
 * não deve ser levado a instalar um deles. E o `tag_name` vem com prefixo
 * (`v0.2.5`), que precisa cair antes de comparar com `app.getVersion()`;
 * comparar string crua diria que `v0.2.5` é maior que `0.2.6`.
 */
export function latestFromRelease(release: GithubRelease): string | null {
  if (release.draft || release.prerelease) return null
  const tag = release.tag_name?.trim()
  if (!tag) return null
  return tag.replace(/^v/, '') || null
}

export async function checkAppUpdate(current: string | null): Promise<UpdateCheck> {
  // Respeita as mesmas chaves da checagem do agente: quem desliga uma, desliga as duas.
  if (process.env.PI_OFFLINE) return { current, latest: null, available: false, skipped: 'offline' }
  if (process.env.PI_SKIP_VERSION_CHECK) {
    return { current, latest: null, available: false, skipped: 'disabled' }
  }
  if (!current) return { current, latest: null, available: false, skipped: 'unknown-version' }

  if (appCache && Date.now() - appCache.at < CACHE_MS && appCache.result.current === current) {
    return appCache.result
  }

  try {
    const res = await fetch(RELEASES_API, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const latest = latestFromRelease((await res.json()) as GithubRelease)

    const result: UpdateCheck = {
      current,
      latest,
      available: Boolean(latest && compareVersions(latest, current) > 0)
    }
    appCache = { at: Date.now(), result }
    return result
  } catch (err) {
    /*
      Mesmo tratamento da checagem do agente: a API do GitHub tem limite de 60
      requisições por hora sem autenticação, e rede corporativa erra. Nada disso
      é problema do usuário — `available: false` mantém a interface quieta.
    */
    return {
      current,
      latest: null,
      available: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * O comando que instala a versão nova.
 *
 * É o `scripts/install.sh` do próprio repositório — o mesmo que a linha de
 * `curl` do README usa. Ele já escolhe `.deb` ou AppImage conforme a máquina,
 * já lida com `sudo` e já resolve o sandbox do Chromium. Duplicar essa lógica
 * aqui daria duas verdades sobre como instalar.
 */
export function appUpdateCommand(): string {
  return 'curl -fsSL https://raw.githubusercontent.com/MatheusBragaC/prime-desk/main/scripts/install.sh | sh'
}
