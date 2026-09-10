#!/usr/bin/env node
/*
  Roda os testes de lógica pura do renderer.

  O projeto não tem framework de teste. Cada suíte aqui existe porque a lógica
  que ela cobre é difícil de conferir na tela: os limiares do aviso de turno
  silencioso são de minutos, e a detecção de documento precisa rodar contra
  texto de conversa real sem levantar o Electron. Empacota cada módulo com o
  esbuild (já dependência do vite), trocando `react`/store por casca quando o
  módulo precisa — a maioria não precisa.
*/
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'prime-desk-test-'))
writeFileSync(
  join(dir, 'react.js'),
  'export const useState=()=>[0,()=>{}]\nexport const useEffect=()=>{}\nexport const useRef=(v)=>({ current: v })\n'
)
/*
  Variante da casca de react que EXECUTA o efeito. Só a suíte da ponte usa: o
  boot (primeira subida) mora dentro de um `useEffect`, e com a casca inerte ele
  nunca rodaria — a escrita do destino no boot ficaria sem cobertura.
*/
writeFileSync(
  join(dir, 'reactEager.js'),
  [
    'export const useState=(init)=>[typeof init==="function"?init():init,()=>{}]',
    'export const useEffect=(fn)=>{ fn() }',
    ''
  ].join('\n')
)
writeFileSync(join(dir, 'storeShim.ts'), 'export const useAgent=()=>undefined\nexport type ToolExec=any\n')
writeFileSync(join(dir, 'i18nShim.ts'), 'export const t=(k:string)=>k\nexport const useT=()=>({ t, lang: "pt" })\n')
/*
  Casca do store para a suíte da ponte: guarda o estado e REGISTRA as escritas,
  que é sobre o que a suíte afirma.
*/
writeFileSync(
  join(dir, 'bridgeStoreShim.ts'),
  [
    'export const calls: { name: string; arg: unknown }[] = []',
    'const rec = (name: string) => (arg?: unknown) => { calls.push({ name, arg }) }',
    'const state: Record<string, unknown> = {',
    "  cwd: '/tmp/projeto',",
    "  execution: { kind: 'local' },",
    "  setStatus: rec('setStatus'),",
    "  setActiveBridge: rec('setActiveBridge'),",
    "  setPlatform: rec('setPlatform'),",
    "  notify: rec('notify'),",
    "  reset: rec('reset'),",
    "  setCwd: (c: unknown) => { state.cwd = c; calls.push({ name: 'setCwd', arg: c }) },",
    "  setExecution: (e: unknown) => { state.execution = e; calls.push({ name: 'setExecution', arg: e }) }",
    '}',
    'export const useAgent = { getState: () => state }',
    '/** Cada fase da suíte parte de um estado conhecido. */',
    'export const startFrom = (execution: unknown, cwd = \'/tmp/projeto\'): void => {',
    '  calls.length = 0',
    '  state.execution = execution',
    '  state.cwd = cwd',
    '}',
    'export const waitForState = async (): Promise<boolean> => true',
    'export const refreshModels = async (): Promise<void> => {}',
    'export const refreshCommands = async (): Promise<void> => {}',
    'export const refreshSessions = async (): Promise<void> => {}',
    'export const refreshFolders = async (): Promise<void> => {}',
    'export const maybeGenerateTitle = async (): Promise<void> => {}',
    ''
  ].join('\n')
)

/** Cada suíte diz que módulo precisa e se ele depende de react/store. */
const SUITES = [
  {
    test: './stall.test.mjs',
    src: 'src/renderer/src/lib/useTurnActivity.ts',
    needsShims: true
  },
  {
    test: './dialogTrap.test.mjs',
    src: 'src/renderer/src/lib/useDialogA11y.ts',
    needsShims: true
  },
  {
    test: './documentDetect.test.mjs',
    src: 'src/renderer/src/lib/documentDetect.ts',
    needsShims: false
  },
  {
    test: './agentUsage.test.mjs',
    src: 'src/renderer/src/lib/agentUsage.ts',
    needsShims: false
  },
  {
    test: './agentTreeDisk.test.mjs',
    src: 'src/main/agent-tree-disk.ts',
    needsShims: false,
    // Módulo do processo principal: usa `node:fs/promises`. Sem isto o esbuild
    // assume plataforma browser e tenta empacotar os builtins do Node.
    platform: 'node',
    /*
      O módulo é copiado para um diretório temporário, então o import relativo
      não resolve mais. A casca também mantém o teste honesto: os diretórios
      reais nunca são tocados — cada caso injeta os seus.
    */
    shims: {
      'session-catalog.js':
        "export const paths = { AGENT_DIR: '/nao-usado', SESSIONS_DIR: '/nao-usado/sessions', ARTIFACTS_DIR: '/nao-usado/session-artifacts' }\n"
    }
  },
  {
    test: './env.test.mjs',
    src: 'src/renderer/src/lib/env.ts',
    needsShims: false,
    // Módulo puro na parte que interessa, mas o arquivo inteiro importa `t`:
    // a casca devolve a chave, e o teste afirma qual chave foi escolhida.
    prepare: (source) => source.replaceAll("from '../i18n'", "from './i18nShim'"),
    /*
      A outra metade do módulo são as chamadas de IPC, que dependem de
      `window.prime` e não entram aqui. A casca do `unwrap` existe só para o
      arquivo carregar; nenhum caso do teste passa por ela.
    */
    shims: {
      'ipc.ts':
        'export async function unwrap(call: Promise<never>): Promise<never> { return call }\n'
    }
  },
  {
    /*
      Contagem de referência da assinatura de ambiente. A casca de react guarda
      slots entre renders e entrega o `subscribe` do `useSyncExternalStore` à
      suíte, que monta e desmonta consumidores na mão. O `lib/env.ts` entra como
      casca porque o que se afirma é quantas vezes watch/unwatch foram pedidos.
    */
    test: './envWatch.test.mjs',
    src: 'src/renderer/src/lib/useEnvironment.ts',
    needsShims: true,
    reactShim: 'reactHooks.js',
    prepare: (source) =>
      source
        .replaceAll("from './env'", "from './envForWatch'")
        .replaceAll("from '../i18n'", "from './i18nShim'") +
      "\nexport { hooks, beginRender, resetHooks } from './reactHooks.js'\n" +
      "\nexport { watchCalls } from './envForWatch'\n",
    shims: {
      'reactHooks.js': readFileSync('scripts/test/shims/reactHooks.js', 'utf8'),
      'envForWatch.ts': readFileSync('scripts/test/shims/envForWatch.ts', 'utf8')
    }
  },
  {
    test: './execution.test.mjs',
    src: 'src/renderer/src/lib/useBridge.ts',
    needsShims: true,
    reactShim: 'reactEager.js',
    /*
      A asserção é sobre o que a subida da ponte ESCREVE no store, então o store
      entra como casca que registra as chamadas e é reexportado para o teste.
    */
    prepare: (source) =>
      source
        .replaceAll("from '../store/agent'", "from './bridgeStoreShim'")
        .replaceAll("from '../i18n'", "from './i18nShim'") +
      "\nexport { useAgent, calls, startFrom } from './bridgeStoreShim'\n"
  }
]

let allOk = true
for (const suite of SUITES) {
  const name = suite.src.split('/').pop().replace(/\.ts$/, '')
  const entry = join(dir, name + '.ts')
  const out = join(dir, name + '.mjs')

  const raw = readFileSync(suite.src, 'utf8')
  const source = suite.prepare
    ? suite.prepare(raw)
    : suite.needsShims
      ? raw.replaceAll("from '../store/agent'", "from './storeShim'")
      : raw
  writeFileSync(entry, source)

  for (const [nome, conteudo] of Object.entries(suite.shims ?? {})) {
    writeFileSync(join(dir, nome), conteudo)
  }

  const args = [entry, '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']
  if (suite.platform) args.push(`--platform=${suite.platform}`)
  if (suite.needsShims) args.push(`--alias:react=${join(dir, suite.reactShim ?? 'react.js')}`)
  execFileSync('./node_modules/.bin/esbuild', args, { stdio: 'inherit' })

  /*
    A suíte pode precisar de globais antes da carga do módulo (localStorage do
    i18n, `window.prime` da ponte), então o teste entra primeiro.
  */
  const { default: run, setup } = await import(suite.test)
  setup?.()
  const mod = await import(out)
  // `await` serve para as duas formas: suíte síncrona devolve boolean.
  const ok = await run(mod)
  if (!ok) allOk = false
}

process.exit(allOk ? 0 : 1)
