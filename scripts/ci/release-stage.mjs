import { execFileSync, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { appendFile, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const stages = new Set(['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'])
const releaseBranches = new Set(['main', 'alpha', 'beta', 'rc', 'next'])
const fullShaPattern = /^[a-f\d]{40}$/i

/**
 * 独立校验源码 HEAD，保留 GitHub 签名的工作流身份；后续状态由官方 receipt 校验。
 * @param {string} stage 已校验的发布阶段。
 * @param {{ env?: NodeJS.ProcessEnv, headSha?: string, platform?: NodeJS.Platform }} [options] 调用环境、当前提交及运行平台。
 * @returns {{ command: string, args: string[], options: { env: NodeJS.ProcessEnv, stdio: 'inherit', shell: boolean } }} 保留完整环境类型的阶段调用配置。
 */
export function buildStageInvocation(stage, { env = {}, headSha, platform = process.platform } = {}) {
  if (!stages.has(stage)) {
    throw new Error(`不支持的发布阶段：${stage}`)
  }
  const sourceSha = env.CI_RELEASE_SOURCE_SHA
  const branch = env.CI_RELEASE_BRANCH
  if (typeof sourceSha !== 'string' || !fullShaPattern.test(sourceSha)) {
    throw new Error('CI_RELEASE_SOURCE_SHA 必须是完整的 commit SHA')
  }
  if (!releaseBranches.has(branch)) {
    throw new Error('CI_RELEASE_BRANCH 只允许 main、alpha、beta、rc、next')
  }
  if (env.GITHUB_REF_NAME !== branch) {
    throw new Error('GITHUB_REF_NAME 必须与已校验的 CI_RELEASE_BRANCH 一致，不得覆写工作流 ref')
  }
  if (!fullShaPattern.test(env.GITHUB_SHA || '')) {
    throw new Error('GITHUB_SHA 必须是 GitHub 提供的完整工作流 commit SHA')
  }
  if (typeof headSha !== 'string' || !fullShaPattern.test(headSha)) {
    throw new Error('无法确认 checkout 的完整 HEAD SHA')
  }
  if (['plan', 'verify'].includes(stage) && headSha.toLowerCase() !== sourceSha.toLowerCase()) {
    throw new Error(`checkout HEAD ${headSha} 与初始 source SHA ${sourceSha} 不一致`)
  }
  // npm provenance 必须匹配真实 JWT 的 revision，源码归属由 HEAD、receipt 和 checkpoint 保证。
  const childEnv = { ...env }
  delete childEnv.CI_RELEASE_SOURCE_SHA
  delete childEnv.CI_RELEASE_BRANCH
  return {
    command: 'pnpm',
    args: ['exec', 'repo', 'release', 'ci', '--stage', stage],
    options: { env: childEnv, stdio: 'inherit', shell: platform === 'win32' },
  }
}

/** 在切换历史源码前固定当前工作流的独立 driver，不修改发布源码或复用旧 receipt。 */
async function pinDriver(headSha) {
  if (!fullShaPattern.test(process.env.GITHUB_SHA || '')
    || headSha.toLowerCase() !== process.env.GITHUB_SHA.toLowerCase()) {
    throw new Error('只能在真实工作流 SHA 的 checkout 固定发布 driver，不能从历史源码重新固定')
  }
  const { RUNNER_TEMP: runnerTemp, GITHUB_ENV: githubEnv } = process.env
  if (!runnerTemp || !path.isAbsolute(runnerTemp) || /[\r\n]/.test(runnerTemp) || !githubEnv) {
    throw new Error('固定发布 driver 需要有效的 RUNNER_TEMP 和 GITHUB_ENV')
  }
  await mkdir(runnerTemp, { recursive: true })
  const driver = path.resolve(runnerTemp, 'release-stage.mjs')
  await copyFile(fileURLToPath(import.meta.url), driver)
  await appendFile(path.resolve(githubEnv), `RELEASE_STAGE_DRIVER=${driver}\n`)
  process.stdout.write(`已固定工作流 ${headSha} 的发布 driver：${driver}\n`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || (!stages.has(args[0]) && args[0] !== '--pin')) {
    throw new Error('必须指定一个合法发布阶段：plan、verify、prepare、upload、confirm、finalize')
  }
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (args[0] === '--pin') {
    await pinDriver(headSha)
    return
  }
  const invocation = buildStageInvocation(args[0], { env: process.env, headSha })
  const result = spawnSync(invocation.command, invocation.args, invocation.options)
  if (result.error) {
    throw result.error
  }
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  await main()
}
