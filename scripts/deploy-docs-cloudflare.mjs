import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export const productionDeploymentSteps = [
  ['--filter', '@weapp-tailwindcss/website', 'deploy:worker'],
  ['--filter', '@weapp-tailwindcss/website', 'verify:deployment', '--', 'https://tw.weapp.dev'],
]

export const nextDeploymentSteps = [
  ['--filter', '@weapp-tailwindcss/website', 'build:next'],
  ['--filter', '@weapp-tailwindcss/website', 'deploy:worker:next'],
  ['--filter', '@weapp-tailwindcss/website', 'verify:deployment', '--', 'https://next.tw.weapp.dev'],
]

const deploymentSteps = {
  next: nextDeploymentSteps,
  production: productionDeploymentSteps,
}

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

export async function deployDocsCloudflare({
  branch = process.env.WORKERS_CI_BRANCH,
  execute = run,
  target = 'production',
} = {}) {
  if (branch && branch !== 'main') {
    throw new Error(`文档 Worker 仅允许从 main 部署，当前分支为 ${branch}`)
  }

  const steps = deploymentSteps[target]
  if (!steps) {
    throw new Error(`未知文档部署目标：${target}`)
  }
  for (const args of steps) {
    await execute(packageManager, args)
  }
}

const currentModule = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === currentModule) {
  const targetOption = process.argv.find(argument => argument.startsWith('--target='))
  const target = targetOption ? targetOption.slice('--target='.length) : 'production'
  deployDocsCloudflare({ target }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
