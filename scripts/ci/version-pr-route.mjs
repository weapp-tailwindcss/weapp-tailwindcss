import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveChangeScopes } from './resolve-pr-scope.mjs'

const shaPattern = /^[a-f\d]{40}$/i
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/
const versionBranch = 'release/pnpm-version'

function validateContext(context) {
  if (context.eventName !== 'workflow_dispatch'
    || context.refName !== versionBranch
    || typeof context.repository !== 'string' || !repositoryPattern.test(context.repository)
    || typeof context.sha !== 'string' || !shaPattern.test(context.sha)) {
    throw new Error('请在 Version PR CI 的 Run workflow 中选择 release/pnpm-version 分支')
  }
}

/** 验收只绑定当前同仓库版本 PR 的准确 head，不允许从 main 或旧版本分支代验。 */
export function resolveVersionPrTarget(context, pullRequests) {
  validateContext(context)
  if (typeof context.currentMainSha !== 'string' || !shaPattern.test(context.currentMainSha)
    || /^0+$/.test(context.currentMainSha)) {
    throw new Error('无法独立确认当前 main 的完整 SHA')
  }
  if (!Array.isArray(pullRequests) || pullRequests.length !== 1) {
    throw new Error('必须存在唯一的未合并版本 PR')
  }
  const pr = pullRequests[0]
  if (!pr || pr.state !== 'open' || pr.merged === true || pr.merged_at != null
    || !Number.isSafeInteger(pr.number) || pr.number <= 0
    || pr.base?.repo?.full_name !== context.repository || pr.head?.repo?.full_name !== context.repository
    || pr.base?.ref !== 'main' || pr.head?.ref !== versionBranch
    || typeof pr.base?.sha !== 'string' || !shaPattern.test(pr.base.sha)
    || typeof pr.head?.sha !== 'string' || !shaPattern.test(pr.head.sha)
    || pr.head.sha.toLowerCase() !== context.sha.toLowerCase()) {
    throw new Error('版本 PR 身份或 head 已改变，请重新生成并在当前版本分支启动验收')
  }
  return { number: pr.number, base: context.currentMainSha.toLowerCase(), head: pr.head.sha.toLowerCase() }
}

function validateCurrentMain(target, cwd) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', target.base, target.head], { cwd, stdio: 'pipe' })
  }
  catch {
    throw new Error('纯版本 PR 必须包含当前 main；请等待最新自动 prepare 完成后再启动验收')
  }
}

/** 读取真实 Git 差异；混入源码、依赖或伪造历史台账时必须拒绝版本专用验收。 */
export function validateVersionPrDiff(target, cwd) {
  validateCurrentMain(target, cwd)
  const scopes = resolveChangeScopes({ eventName: 'pull_request', base: target.base, head: target.head, cwd })
  if (scopes.metadata_only !== true) {
    throw new Error('当前 PR 不符合纯版本元数据契约；请先在 main 修复，再由自动 prepare 重新生成')
  }
}

function main() {
  const args = process.argv.slice(2)
  const checkCurrent = args.length === 1 && args[0] === '--check-current'
  const outputMode = args.length === 2 && args[0] === '--github-output'
  if (!checkCurrent && !outputMode) {
    throw new Error('仅支持 --github-output <路径> 或 --check-current')
  }
  const context = {
    eventName: process.env.GITHUB_EVENT_NAME,
    refName: process.env.GITHUB_REF_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    currentMainSha: undefined,
  }
  validateContext(context)
  const repository = context.repository
  const mainRef = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/git/ref/heads/main`], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  }))
  if (mainRef.ref !== 'refs/heads/main' || mainRef.object?.type !== 'commit') {
    throw new Error('当前 main ref 未指向有效 commit')
  }
  context.currentMainSha = mainRef.object.sha
  const owner = repository.slice(0, repository.indexOf('/'))
  const response = execFileSync('gh', [
    'api',
    '--method',
    'GET',
    `repos/${repository}/pulls`,
    '-f',
    'state=open',
    '-f',
    'base=main',
    '-f',
    `head=${owner}:${versionBranch}`,
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  const target = resolveVersionPrTarget(context, JSON.parse(response))
  const checkout = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (checkout.toLowerCase() !== target.head) {
    throw new Error('当前 checkout 与版本 PR head 不一致')
  }
  if (outputMode) {
    validateVersionPrDiff(target, process.cwd())
    appendFileSync(path.resolve(args[1]), `number=${target.number}\nhead=${target.head}\nbase=${target.base}\n`)
  }
  else {
    validateCurrentMain(target, process.cwd())
  }
  process.stdout.write(`${JSON.stringify(target)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
