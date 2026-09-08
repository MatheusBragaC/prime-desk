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

  const args = [entry, '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']
  if (suite.needsShims) args.push(`--alias:react=${join(dir, 'react.js')}`)
  execFileSync('./node_modules/.bin/esbuild', args, { stdio: 'inherit' })

  const mod = await import(out)
  const { default: run } = await import(suite.test)
  const ok = run(mod)
  if (!ok) allOk = false
}

process.exit(allOk ? 0 : 1)
