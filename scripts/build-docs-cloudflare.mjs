import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`命令执行失败：${command} ${args.join(' ')}（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`))
    })
  })
}

async function main() {
  await run(packageManager, ['install', '--frozen-lockfile'])
  await run(packageManager, ['--filter', '@weapp-tailwindcss/website', 'check:docs-audience'])
  await run(packageManager, ['--filter', '@weapp-tailwindcss/website', 'seo:few-keywords'])
  await run(packageManager, ['--filter', '@weapp-tailwindcss/website', 'build'])
  await run(packageManager, ['--filter', '@weapp-tailwindcss/website', 'seo:quality:strict'])
  await run(packageManager, ['--filter', '@weapp-tailwindcss/website', 'test:worker'])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
