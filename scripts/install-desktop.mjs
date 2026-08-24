/**
 * Instala o ícone e o atalho do Prime Desk no ambiente do usuário (Linux).
 *
 * Por que é preciso: no Linux a barra de tarefas/dock **não** usa o ícone da
 * janela. Ela casa o `WM_CLASS` da janela com um arquivo `.desktop` instalado.
 * Sem esse arquivo, o shell mostra um ícone genérico (a engrenagem), mesmo com
 * `BrowserWindow({ icon })` correto.
 *
 * Instala em ~/.local/share, ou seja, sem sudo. O pacote .deb já faz o
 * equivalente em /usr/share; este script serve para uso em desenvolvimento ou
 * para quem roda o AppImage.
 *
 *   node scripts/install-desktop.mjs            # instala
 *   node scripts/install-desktop.mjs --remove   # desinstala
 */
import { copyFile, mkdir, writeFile, rm, access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = homedir()
const iconsRoot = join(home, '.local', 'share', 'icons', 'hicolor')
const appsDir = join(home, '.local', 'share', 'applications')
const desktopFile = join(appsDir, 'prime-desk.desktop')
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

const remove = process.argv.includes('--remove')

function run(cmd, args) {
  return new Promise((res) => execFile(cmd, args, { timeout: 20_000 }, () => res(undefined)))
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

if (remove) {
  await rm(desktopFile, { force: true })
  for (const size of SIZES) {
    await rm(join(iconsRoot, `${size}x${size}`, 'apps', 'prime-desk.png'), { force: true })
  }
  await run('update-desktop-database', [appsDir])
  await run('gtk-update-icon-cache', ['-f', '-t', iconsRoot])
  console.log('Atalho e ícones removidos.')
  process.exit(0)
}

if (!(await exists(join(root, 'build', 'icons', '512x512.png')))) {
  console.error('Ícones não encontrados. Rode `npm run icon` antes.')
  process.exit(1)
}

for (const size of SIZES) {
  const src = join(root, 'build', 'icons', `${size}x${size}.png`)
  if (!(await exists(src))) continue
  const dir = join(iconsRoot, `${size}x${size}`, 'apps')
  await mkdir(dir, { recursive: true })
  await copyFile(src, join(dir, 'prime-desk.png'))
}

// Em desenvolvimento aponta para o binário empacotado se existir; senão, npm start.
const packaged = join(root, 'release', 'linux-unpacked', 'prime-desk')
const exec = (await exists(packaged))
  ? JSON.stringify(packaged)
  : `sh -c 'cd ${JSON.stringify(root)} && npm start'`

const entry = `[Desktop Entry]
Type=Application
Name=Prime Desk
Comment=Interface gráfica para o prime-agent
Exec=${exec}
Icon=prime-desk
Terminal=false
Categories=Development;
Keywords=ai;agent;llm;prime;
StartupWMClass=prime-desk
`

await mkdir(appsDir, { recursive: true })
await writeFile(desktopFile, entry, 'utf-8')
await run('update-desktop-database', [appsDir])
await run('gtk-update-icon-cache', ['-f', '-t', iconsRoot])

console.log('Atalho instalado em', desktopFile)
console.log('Ícones em', iconsRoot)
console.log('Se a barra de tarefas não atualizar na hora, faça logout/login da sessão gráfica.')
