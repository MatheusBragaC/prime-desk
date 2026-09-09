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
writeFileSync(join(dir, 'react.js'), 'export const useState=()=>[0,()=>{}]\nexport const useEffect=()=>{}\n')
writeFileSync(join(dir, 'storeShim.ts'), 'export const useAgent=()=>undefined\nexport type ToolExec=any\n')

/** Cada suíte diz que módulo precisa e se ele depende de react/store. */
const SUITES = [
  {
    test: './stall.test.mjs',
    src: 'src/renderer/src/lib/useTurnActivity.ts',
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
  }
]

let allOk = true
for (const suite of SUITES) {
  const name = suite.src.split('/').pop().replace(/\.ts$/, '')
  const entry = join(dir, name + '.ts')
  const out = join(dir, name + '.mjs')

  const source = suite.needsShims
    ? readFileSync(suite.src, 'utf8').replaceAll("from '../store/agent'", "from './storeShim'")
    : readFileSync(suite.src, 'utf8')
  writeFileSync(entry, source)

  for (const [nome, conteudo] of Object.entries(suite.shims ?? {})) {
    writeFileSync(join(dir, nome), conteudo)
  }

  const args = [entry, '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']
  if (suite.platform) args.push(`--platform=${suite.platform}`)
  if (suite.needsShims) args.push(`--alias:react=${join(dir, 'react.js')}`)
  execFileSync('./node_modules/.bin/esbuild', args, { stdio: 'inherit' })

  const mod = await import(out)
  const { default: run } = await import(suite.test)
  // `await` serve para as duas formas: suíte síncrona devolve boolean.
  const ok = await run(mod)
  if (!ok) allOk = false
}

process.exit(allOk ? 0 : 1)
