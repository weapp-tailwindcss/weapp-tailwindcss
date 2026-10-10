import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const stages = new Set(['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'])
const releaseBranches = new Set(['main', 'alpha', 'beta', 'rc', 'next'])
const fullShaPattern = /^[a-f\d]{40}$/i

/**
 * 验证初始提交，将当前 HEAD 身份传给 repoctl，后续状态由官方 receipt 校验。
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
  if (typeof headSha !== 'string' || !fullShaPattern.test(headSha)) {
    throw new Error('无法确认 checkout 的完整 HEAD SHA')
  }
  if (['plan', 'verify'].includes(stage) && headSha.toLowerCase() !== sourceSha.toLowerCase()) {
    throw new Error(`checkout HEAD ${headSha} 与初始 source SHA ${sourceSha} 不一致`)
  }
  const childEnv = { ...env, GITHUB_SHA: headSha.toLowerCase(), GITHUB_REF_NAME: branch }
  delete childEnv.CI_RELEASE_SOURCE_SHA
  delete childEnv.CI_RELEASE_BRANCH
  return {
    command: 'pnpm',
    args: ['exec', 'repo', 'release', 'ci', '--stage', stage],
    options: { env: childEnv, stdio: 'inherit', shell: platform === 'win32' },
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || !stages.has(args[0])) {
    throw new Error('必须指定一个合法发布阶段：plan、verify、prepare、upload、confirm、finalize')
  }
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const invocation = buildStageInvocation(args[0], { env: process.env, headSha })
  const result = spawnSync(invocation.command, invocation.args, invocation.options)
  if (result.error) {
    throw result.error
  }
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
