#!/usr/bin/env node
/*
  Roda os testes de lógica pura do renderer.

  O projeto não tem framework de teste, e não é hora de escolher um: aqui há um
  caso só, e ele existe porque os limiares do aviso de turno silencioso são de
  minutos — conferir na tela exigiria esperar minutos, e no painel onde a
  inspeção acontece os timers são estrangulados.

  O módulo real é empacotado pelo esbuild (já dependência do vite) com `react` e
  a store trocados por casca, para o teste rodar em Node sem DOM.
*/
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'prime-desk-test-'))

writeFileSync(join(dir, 'react.js'), 'export const useState=()=>[0,()=>{}]\nexport const useEffect=()=>{}\n')
writeFileSync(join(dir, 'storeShim.ts'), 'export const useAgent=()=>undefined\nexport type ToolExec=any\n')

const src = 'src/renderer/src/lib/useTurnActivity.ts'
writeFileSync(
  join(dir, 'useTurnActivity.ts'),
  readFileSync(src, 'utf8').replaceAll("from '../store/agent'", "from './storeShim'")
)

execFileSync('./node_modules/.bin/esbuild', [
  join(dir, 'useTurnActivity.ts'),
  '--bundle', '--format=esm',
  `--alias:react=${join(dir, 'react.js')}`,
  `--outfile=${join(dir, 'turnActivity.mjs')}`,
  '--log-level=error'
], { stdio: 'inherit' })

const { stallOf, NOTICE_AFTER_MS } = await import(join(dir, 'turnActivity.mjs'))
const { default: run } = await import('./stall.test.mjs')
process.exit(run({ stallOf, NOTICE_AFTER_MS }) ? 0 : 1)
