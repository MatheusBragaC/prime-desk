/**
 * Rasteriza resources/brand/prime-butterfly.svg em PNGs de ícone.
 *
 * Usa o próprio Electron como rasterizador — evita depender de Inkscape,
 * librsvg ou ImageMagick, que não existem em toda máquina de build.
 *
 *   npx electron scripts/make-icon.mjs
 *
 * Saída: build/icon.png (1024) + build/icons/<n>x<n>.png
 * O electron-builder gera .icns e .ico a partir do 1024.
 */
import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'resources/brand/prime-butterfly.svg'), 'utf-8')
const SIZE = 1024
const EXPORTS = [1024, 512, 256, 128, 64, 48, 32, 16]

// Padding proporcional: ícones de app respiram melhor com margem.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent;}
  .wrap{width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center;}
  svg{width:${Math.round(SIZE * 0.82)}px;height:${Math.round(SIZE * 0.82)}px;}
</style></head><body><div class="wrap">${svg}</div></body></html>`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true }
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 700))

  const image = await win.webContents.capturePage()
  if (image.isEmpty()) {
    console.error('captura vazia — abortando')
    app.exit(1)
    return
  }

  mkdirSync(join(root, 'build/icons'), { recursive: true })
  writeFileSync(join(root, 'build/icon.png'), image.toPNG())

  for (const size of EXPORTS) {
    const resized = size === SIZE ? image : image.resize({ width: size, height: size, quality: 'best' })
    writeFileSync(join(root, `build/icons/${size}x${size}.png`), resized.toPNG())
  }

  console.log('ícones gerados em build/ —', EXPORTS.join(', '))
  app.exit(0)
})

process.on('uncaughtException', (e) => {
  console.error(e)
  app.exit(1)
})

void nativeImage
