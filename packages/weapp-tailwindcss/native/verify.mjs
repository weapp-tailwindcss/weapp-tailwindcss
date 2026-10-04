import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync(process.execPath, ['--import', 'tsx', 'native/test/wxml.ts'], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: { ...process.env, WEAPP_TW_NATIVE: 'required' },
})
if (result.error) {
  throw result.error
}
if (result.status !== 0) {
  throw new Error(`Native ABI verification failed (${result.signal ?? result.status})`)
}
