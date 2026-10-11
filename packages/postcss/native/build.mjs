import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const command = spawnSync('cargo', ['build', '--manifest-path', path.join(root, 'Cargo.toml'), '--release', '--locked'], { stdio: 'inherit' })
if (command.error) {
  throw command.error
}
if (command.status !== 0) {
  process.exit(command.status ?? 1)
}
const library = process.platform === 'win32'
  ? 'weapp_tailwindcss_postcss_native.dll'
  : process.platform === 'darwin' ? 'libweapp_tailwindcss_postcss_native.dylib' : 'libweapp_tailwindcss_postcss_native.so'
copyFileSync(path.join(root, 'target', 'release', library), path.join(root, 'weapp-tailwindcss-postcss.node'))
