import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const file of ['native/test/wxml.ts', 'native/test/js.ts', 'native/test/transform.ts', 'native/test/transform/babel.ts']) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', file], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: { ...process.env, WEAPP_TW_NATIVE: 'required' },
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Native ABI verification failed for ${file} (${result.signal ?? result.status})`)
  }
}
