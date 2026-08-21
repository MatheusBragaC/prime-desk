import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
