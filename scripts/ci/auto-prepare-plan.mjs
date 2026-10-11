import { execFileSync, spawnSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createReleasePlan } from 'repoctl'
import { buildStageInvocation } from './release-stage.mjs'

const fullShaPattern = /^[a-f\d]{40}$/i

/** 核对远端 main 的唯一真实提交，网络及输出异常必须阻断自动准备。 */
export function parseRemoteMainSha(output) {
  const match = /^([a-fA-F\d]{40})[\t ]+refs\/heads\/main\r?\n?$/.exec(output)
  if (!match || /^0+$/.test(match[1])) {
    throw new Error('无法确认 origin/main 的唯一完整 commit SHA')
  }
  return match[1].toLowerCase()
}

/** 只读官方计划负责校验包、intent 和 ledger；不能把解析失败当作没有待发布版本。 */
export function hasPlannedVersions(plan) {
  if (plan?.status === 'blocked') {
    throw new Error(`自动准备版本计划被阻断：${plan.blockers.map(item => `${item.id}: ${item.detail}`).join('; ')}`)
  }
  if (plan?.schemaVersion !== 1 || !Array.isArray(plan.packages)
    || !Array.isArray(plan.blockers) || plan.blockers.length
    || !['ready', 'empty'].includes(plan.status)
    || (plan.status === 'ready') !== (plan.packages.length > 0)) {
    throw new Error('无法确认官方只读版本计划，拒绝跳过发布验证')
  }
  return plan.status === 'ready'
}

/** 自动准备始终核对受信任的 source SHA；手动及合并发布使用既有流程。 */
export function isLatestAutomaticPrepare({ env, readRemoteMain }) {
  if (env.GITHUB_EVENT_NAME !== 'push') {
    return true
  }
  if (env.REPO_RELEASE_MODE !== 'prepare' || env.GITHUB_REF_NAME !== 'main'
    || !fullShaPattern.test(env.GITHUB_SHA || '')) {
    throw new Error('自动准备只接受已校验的 main push prepare 路由')
  }
  const latestSha = parseRemoteMainSha(readRemoteMain())
  return latestSha === env.GITHUB_SHA.toLowerCase()
}

/** 自动 push 只准备最新 main；手动准备、合并发布及恢复不使用 intent 过滤。 */
export async function shouldRunAutomaticPrepare({ env, cwd, readRemoteMain, planRelease = createReleasePlan }) {
  if (!isLatestAutomaticPrepare({ env, readRemoteMain })) {
    return false
  }
  if (env.GITHUB_EVENT_NAME !== 'push') {
    return true
  }
  const plan = await planRelease({ cwd, branch: 'main', env })
  return hasPlannedVersions(plan)
}

/** 完整验证结束后再次核对 main，阻止过期自动任务改写受管版本分支。 */
export function assertCurrentAutomaticPrepare(options) {
  if (!isLatestAutomaticPrepare(options)) {
    throw new Error('origin/main 已更新，停止过期自动 prepare，交由新 main 任务重新生成版本 PR')
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--assert-current-main')) {
    throw new Error('仅支持 --assert-current-main 或无参数计划')
  }
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const invocation = buildStageInvocation('plan', { env: process.env, headSha })
  const source = {
    env: invocation.options.env,
    cwd: process.cwd(),
    readRemoteMain: () => execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }),
  }
  if (args[0] === '--assert-current-main') {
    assertCurrentAutomaticPrepare(source)
    process.stdout.write('自动 prepare source 仍对应最新 origin/main\n')
    return
  }
  const run = await shouldRunAutomaticPrepare(source)
  if (!run) {
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error('缺少 GITHUB_OUTPUT，无法阻止 native 及正式发布 job')
    }
    await appendFile(path.resolve(process.env.GITHUB_OUTPUT), 'run=false\n')
    process.stdout.write('自动 main prepare 无待版本变更或已被新提交取代，run=false\n')
    return
  }
  // 官方阶段创建自己的 receipt，完整 native、quality 和版本 hooks 在正式 job 执行。
  const result = spawnSync(invocation.command, invocation.args, invocation.options)
  if (result.error) {
    throw result.error
  }
  process.exitCode = result.status ?? 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
