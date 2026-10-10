import { appendFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const releaseBranches = new Set(['main', 'alpha', 'beta', 'rc', 'next'])
const releaseModes = new Set(['auto', 'prepare', 'publish', 'publish-unpublished'])
const fullShaPattern = /^[a-f\d]{40}$/i
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/

function skippedRoute() {
  return { run: false, ref: '', mode: '', branch: '' }
}

/** 仅接受受信任的发布事件，并绑定正式编译与发布应消费的同一提交。 */
export function resolveReleaseRoute(eventName, event, options = {}) {
  const { repository, sha, refName } = options
  const oidcAudit = options.oidcAudit ?? event?.inputs?.oidc_audit
  if (oidcAudit === true || oidcAudit === 'true') {
    return skippedRoute()
  }
  if (typeof repository !== 'string' || !repositoryPattern.test(repository)) {
    return skippedRoute()
  }
  if (event?.repository && event.repository.full_name !== repository) {
    return skippedRoute()
  }

  if (eventName === 'pull_request_target') {
    const pullRequest = event?.pull_request
    if (event?.action !== 'closed'
      || event?.repository?.full_name !== repository
      || pullRequest?.merged !== true
      || pullRequest?.base?.repo?.full_name !== repository
      || pullRequest?.head?.repo?.full_name !== repository
      || pullRequest?.base?.ref !== 'main'
      || pullRequest?.head?.ref !== 'release/pnpm-version'
      || typeof pullRequest?.merge_commit_sha !== 'string'
      || !fullShaPattern.test(pullRequest.merge_commit_sha)) {
      return skippedRoute()
    }
    return { run: true, ref: pullRequest.merge_commit_sha, mode: 'publish', branch: 'main' }
  }

  if (eventName === 'workflow_dispatch') {
    const mode = options.mode || event?.inputs?.mode || 'prepare'
    if (!releaseBranches.has(refName)
      || !releaseModes.has(mode)
      || typeof sha !== 'string'
      || !fullShaPattern.test(sha)) {
      return skippedRoute()
    }
    return { run: true, ref: sha, mode, branch: refName }
  }

  return skippedRoute()
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 2 || (args.length && args[0] !== '--github-output')) {
    throw new Error('仅支持 --github-output [文件路径] 参数')
  }
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) {
    throw new Error('缺少 GITHUB_EVENT_PATH，无法确认发布事件')
  }
  const event = JSON.parse(await readFile(path.resolve(eventPath), 'utf8'))
  const route = resolveReleaseRoute(process.env.GITHUB_EVENT_NAME, event, {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    refName: process.env.GITHUB_REF_NAME,
    mode: process.env.REPO_RELEASE_MODE || undefined,
    oidcAudit: process.env.REPO_RELEASE_OIDC_AUDIT || undefined,
  })
  if (args.length) {
    const outputPath = args[1] || process.env.GITHUB_OUTPUT
    if (!outputPath) {
      throw new Error('缺少 GITHUB_OUTPUT 或 --github-output 文件路径')
    }
    await appendFile(path.resolve(outputPath), Object.entries(route).map(([name, value]) => `${name}=${value}\n`).join(''))
  }
  process.stdout.write(`${JSON.stringify(route)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
