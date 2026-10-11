import { execFileSync, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryPattern = /^[\w.-]+\/[\w.-]+$/
const shaPattern = /^(?!0{40}$)[a-f\d]{40}$/i
const numberPattern = /^[1-9]\d*$/

/** 版本发布只接受本仓库合并到 main 的受管 PR 身份。 */
export function isMergedVersionPr(pullRequest, repository) {
  return repositoryPattern.test(repository || '')
    && pullRequest?.merged === true
    && pullRequest.base?.ref === 'main'
    && pullRequest.base?.repo?.full_name === repository
    && pullRequest.head?.ref === 'release/pnpm-version'
    && pullRequest.head?.repo?.full_name === repository
    && typeof pullRequest.merge_commit_sha === 'string'
    && shaPattern.test(pullRequest.merge_commit_sha)
}

function readGitHubPullRequest(repository, number) {
  return JSON.parse(execFileSync('gh', ['api', `repos/${repository}/pulls/${number}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }))
}

function isOriginMainAncestor(sha) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error('无法确认 merge SHA 与 origin/main 的祖先关系')
  }
  return result.status === 0
}

/** 从 API 重新确认准确 PR 与 merge SHA，禁止调用者自行指定发布源码。 */
export async function loadMergedVersionPr(number, repository, {
  readPullRequest = readGitHubPullRequest,
  isMainAncestor = isOriginMainAncestor,
} = {}) {
  if (typeof number !== 'string' || !numberPattern.test(number)
    || !Number.isSafeInteger(Number(number)) || !repositoryPattern.test(repository || '')) {
    throw new Error('已合并版本 PR 必须使用合法仓库与正整数编号')
  }
  const pullRequest = await readPullRequest(repository, Number(number))
  if (!isMergedVersionPr(pullRequest, repository)
    || pullRequest.number !== Number(number) || pullRequest.state !== 'closed') {
    throw new Error('GitHub API 未确认同仓库已合并的受管版本 PR')
  }
  if (!await isMainAncestor(pullRequest.merge_commit_sha)) {
    throw new Error('版本 PR 的 merge SHA 不属于 origin/main 历史')
  }
  return pullRequest
}

/** PR 事件只调度 main 工作流；OIDC 交换由新的 dispatch 身份执行。 */
export function buildReleaseDispatch(event, repository) {
  if (event?.action !== 'closed' || event.repository?.full_name !== repository
    || !isMergedVersionPr(event.pull_request, repository)
    || event.pull_request.state !== 'closed'
    || !Number.isSafeInteger(event.pull_request.number) || event.pull_request.number <= 0) {
    throw new Error('拒绝为未合并或错误来源的 PR 调度正式发布')
  }
  return {
    workflow: 'release.yml',
    body: { ref: 'main', inputs: { mode: 'publish', version_pr: String(event.pull_request.number) } },
  }
}

async function main() {
  if (process.argv.length !== 2 || process.env.GITHUB_EVENT_NAME !== 'pull_request_target'
    || !process.env.GITHUB_EVENT_PATH) {
    throw new Error('发布调度仅接受真实 pull_request_target 合并事件')
  }
  const repository = process.env.GITHUB_REPOSITORY
  const event = JSON.parse(await readFile(path.resolve(process.env.GITHUB_EVENT_PATH), 'utf8'))
  const dispatch = buildReleaseDispatch(event, repository)
  const pullRequest = await loadMergedVersionPr(dispatch.body.inputs.version_pr, repository)
  if (pullRequest.merge_commit_sha !== event.pull_request.merge_commit_sha) {
    throw new Error('API 的 merge SHA 与原合并事件不一致')
  }
  execFileSync('gh', ['api', '--method', 'POST', `repos/${repository}/actions/workflows/${dispatch.workflow}/dispatches`, '--input', '-'], {
    input: JSON.stringify(dispatch.body),
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 30_000,
  })
  process.stdout.write(`已调度版本 PR #${pullRequest.number}，发布源 ${pullRequest.merge_commit_sha}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
