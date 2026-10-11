import { execFile } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const execute = promisify(execFile)
const shaPattern = /^[a-f0-9]{40}$/

export function requireProductionContext(env: NodeJS.ProcessEnv) {
  if (env.GITHUB_REPOSITORY !== 'weapp-tailwindcss/weapp-tailwindcss'
    || env.GITHUB_REF !== 'refs/heads/main'
    || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '')) {
    throw new Error('仅允许目标组织仓库的 main 推送或手动部署')
  }
}

export function requireCloudflareCredentials(env: NodeJS.ProcessEnv) {
  for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    if (!env[name]?.trim()) {
      throw new Error(`缺少 ${name}：请检查组织 Secret 对本仓库的可见性`)
    }
  }
}

async function readMainSha() {
  const { stdout } = await execute('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
    cwd: repositoryRoot,
    timeout: 30_000,
  })
  return stdout.trim().split(/\s+/)[0]
}

export async function isLatestProductionCommit(env: NodeJS.ProcessEnv, readLatest = readMainSha) {
  requireProductionContext(env)
  const sha = env.GITHUB_SHA ?? ''
  if (!shaPattern.test(sha)) {
    throw new Error('缺少有效的 GITHUB_SHA，不能确认待部署提交')
  }
  const latest = await readLatest()
  if (!shaPattern.test(latest)) {
    throw new Error('无法读取有效的远端 main SHA，停止部署')
  }
  return latest === sha
}

async function main() {
  if (process.argv.includes('--credentials')) {
    requireProductionContext(process.env)
    requireCloudflareCredentials(process.env)
    return
  }
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('缺少 GITHUB_OUTPUT，无法传递部署门禁结果')
  }
  const deploy = await isLatestProductionCommit(process.env)
  await appendFile(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`)
  console.log(deploy ? '当前提交仍为最新 main，允许部署' : 'main 已前进，跳过本次过期提交部署')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
