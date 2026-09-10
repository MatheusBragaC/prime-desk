import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    /**
     * `node-pty` é módulo nativo: o `.node` tem que ser carregado do disco em
     * runtime, não pode ser bundlado pelo rollup. O plugin deixa as deps do
     * package.json como `require` externo.
     */
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      /**
       * CommonJS, não ESM: preload em renderer sandboxed não aceita `import`
       * (falha com "Cannot use import statement outside a module" e a API nem
       * chega ao `window`). Como o package.json é `type: module`, o CJS precisa
       * da extensão `.cjs` — que é o caminho carregado em src/main/index.ts.
       */
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    },
    /*
     * Os dois aliases existem também em `tsconfig.json` (`paths`): o build usa
     * este resolvedor, o `npm run typecheck` usa o do `tsc`. Mudar um sem o
     * outro compila e quebra no outro lado.
     *
     * `@shared` só é declarado aqui, no renderer: main e preload continuam com
     * import relativo com extensão `.js`, que é o que o bundle CJS do preload e
     * o `externalizeDepsPlugin` do main já resolvem.
     */
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
