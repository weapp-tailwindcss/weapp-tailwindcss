import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageRoot } from '../src/paths'

const scripts = [
  'scripts/parity.mts',
  'scripts/bundle.mts',
  'scripts/bench.mts',
  'scripts/generate-reports.mts',
  'scripts/generate-upstream-report.mts',
]

function run(script: string) {
  const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'))
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, join(packageRoot, script)], {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${script} exited ${code}`))
    })
  })
}

for (const script of scripts) {
  await run(script)
}
