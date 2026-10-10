import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveReleaseRoute } from '../../../../scripts/ci/release-route.mjs'

const repository = 'weapp-tailwindcss/weapp-tailwindcss'
const sha = 'a'.repeat(40)
const mergeSha = 'b'.repeat(40)
const context = { repository, sha, refName: 'main' }
const skipped = { run: false, ref: '', mode: '', branch: '' }

function mergedReleaseEvent() {
  return {
    action: 'closed',
    repository: { full_name: repository },
    pull_request: {
      merged: true,
      merge_commit_sha: mergeSha,
      base: { ref: 'main', repo: { full_name: repository } },
      head: { ref: 'release/pnpm-version', repo: { full_name: repository } },
    },
  }
}

function mainPushEvent() {
  return { repository: { full_name: repository }, ref: 'refs/heads/main', after: mergeSha, deleted: false }
}

describe('Release 事件路由', () => {
  it('PR 合并事件不得直接进入上传路线，必须由独立调度器处理', () => {
    expect(resolveReleaseRoute('pull_request_target', mergedReleaseEvent(), context)).toEqual(skipped)
  })

  it('main push 绑定事件 after，始终 prepare 并忽略 runner SHA 和手动 mode', () => {
    expect(resolveReleaseRoute('push', mainPushEvent(), { ...context, mode: 'publish' })).toEqual({
      run: true,
      ref: mergeSha,
      mode: 'prepare',
      branch: 'main',
    })
  })

  it.each(['alpha', 'beta', 'rc', 'next', 'release/pnpm-version', 'codex/fix'])('拒绝 %s 分支 push 自动准备', (refName) => {
    expect(resolveReleaseRoute('push', { ...mainPushEvent(), ref: `refs/heads/${refName}` }, { ...context, refName })).toEqual(skipped)
  })

  it.each(['', 'abc123', 'g'.repeat(40), '0'.repeat(40), `${mergeSha}\nmode=publish`])('拒绝非法 push after %j', (after) => {
    expect(resolveReleaseRoute('push', { ...mainPushEvent(), after }, context)).toEqual(skipped)
  })

  it('拒绝 main 删除、runner 发布线不一致和来源仓库缺失的 push', () => {
    expect(resolveReleaseRoute('push', { ...mainPushEvent(), deleted: true }, context)).toEqual(skipped)
    expect(resolveReleaseRoute('push', mainPushEvent(), { ...context, refName: 'next' })).toEqual(skipped)
    expect(resolveReleaseRoute('push', { ref: 'refs/heads/main', after: mergeSha }, context)).toEqual(skipped)
  })

  it.each(['pull_request', 'workflow_run', 'schedule', ''])('拒绝 %s 事件', (eventName) => {
    expect(resolveReleaseRoute(eventName, mergedReleaseEvent(), context)).toEqual(skipped)
  })

  it.each(['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review'])('拒绝未关闭的 %s PR 事件', (action) => {
    const event = mergedReleaseEvent()
    event.action = action
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it('拒绝仅关闭但未合并的 release PR', () => {
    const event = mergedReleaseEvent()
    event.pull_request.merged = false
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it.each(['head', 'base'] as const)('拒绝 %s 仓库身份不一致的 PR', (side) => {
    const event = mergedReleaseEvent()
    event.pull_request[side].repo.full_name = 'attacker/weapp-tailwindcss'
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it('拒绝事件仓库身份与 runner 环境不一致', () => {
    const event = mergedReleaseEvent()
    event.repository.full_name = 'attacker/weapp-tailwindcss'
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it.each(['codex/fix', 'release/pnpm-version\nref=attacker'])('拒绝普通或带输出注入的 head 分支 %j', (ref) => {
    const event = mergedReleaseEvent()
    event.pull_request.head.ref = ref
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it('拒绝合并到预发布分支的 release PR', () => {
    const event = mergedReleaseEvent()
    event.pull_request.base.ref = 'next'
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it.each(['', 'abc123', 'g'.repeat(40), `${mergeSha}\nmode=publish`, ` ${mergeSha}`])('拒绝非法 merge SHA %j', (value) => {
    const event = mergedReleaseEvent()
    event.pull_request.merge_commit_sha = value
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it.each([{}, { action: 'closed', pull_request: null }, null])('不完整的 PR payload 安全跳过', (event) => {
    expect(resolveReleaseRoute('pull_request_target', event, context)).toEqual(skipped)
  })

  it('纯解析不修改事件及调用上下文', () => {
    const event = mergedReleaseEvent()
    const before = JSON.stringify({ event, context })
    resolveReleaseRoute('pull_request_target', event, context)
    expect(JSON.stringify({ event, context })).toBe(before)
  })

  it('手动执行默认 prepare 并绑定 runner 的完整 commit SHA', () => {
    expect(resolveReleaseRoute('workflow_dispatch', { repository: { full_name: repository } }, context)).toEqual({
      run: true,
      ref: sha,
      mode: 'prepare',
      branch: 'main',
    })
  })

  it.each(['alpha', 'beta', 'rc', 'next'])('允许手动选择 %s 预发布线的 auto 模式', (refName) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, refName, mode: 'auto' })).toEqual({
      run: true,
      ref: sha,
      mode: 'auto',
      branch: refName,
    })
  })

  it('main auto 不得隐式发布，预发布 prepare 不得误入仅 stable 的官方准备阶段', () => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, mode: 'auto' })).toEqual(skipped)
    for (const refName of ['alpha', 'beta', 'rc', 'next']) {
      expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, refName, mode: 'prepare' })).toEqual(skipped)
      expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, refName, mode: 'publish' })).toMatchObject({ run: true, mode: 'publish', branch: refName })
    }
  })

  it.each(['prepare', 'publish', 'publish-unpublished'])('允许手动 %s 模式', (mode) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, mode })).toMatchObject({ run: true, mode })
  })

  it('从 dispatch inputs 读取模式，显式上下文优先', () => {
    const event = { inputs: { mode: 'publish' } }
    expect(resolveReleaseRoute('workflow_dispatch', event, context).mode).toBe('publish')
    expect(resolveReleaseRoute('workflow_dispatch', event, { ...context, mode: 'prepare' }).mode).toBe('prepare')
  })

  it.each(['codex/fix', 'refs/heads/main', 'main\nmode=publish', ''])('拒绝手动非法发布线 %j', (refName) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, refName })).toEqual(skipped)
  })

  it.each(['oidc-audit', 'unknown', 'publish\nrun=true'])('拒绝手动非法模式 %j', (mode) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, mode })).toEqual(skipped)
  })

  it.each([true, 'true'])('OIDC audit %j 只走独立审核 job', (oidcAudit) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, oidcAudit })).toEqual(skipped)
  })

  it('不把字符串 false 误判为 OIDC audit', () => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, oidcAudit: 'false' }).run).toBe(true)
  })

  it('从 dispatch inputs 读取 audit 并拒绝非法 runner SHA', () => {
    expect(resolveReleaseRoute('workflow_dispatch', { inputs: { oidc_audit: 'true' } }, context)).toEqual(skipped)
    expect(resolveReleaseRoute('workflow_dispatch', {}, { ...context, sha: 'main' })).toEqual(skipped)
  })
})

describe('Release 路由 CLI', () => {
  let cwd: string
  const script = path.resolve(import.meta.dirname, '../../../../scripts/ci/release-route.mjs')

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'weapp-release-route-'))
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  async function run(eventName: string, event: unknown, env: NodeJS.ProcessEnv = {}, args = ['--github-output']) {
    const eventPath = path.join(cwd, 'event.json')
    await writeFile(eventPath, JSON.stringify(event))
    return spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: repository,
        GITHUB_SHA: sha,
        GITHUB_REF_NAME: 'main',
        GITHUB_OUTPUT: path.join(cwd, 'output'),
        REPO_RELEASE_MODE: undefined,
        REPO_RELEASE_OIDC_AUDIT: undefined,
        ...env,
      },
    })
  }

  it('PR_target CLI 输出否决结果，不能仅覆盖 SHA 后直接发布', async () => {
    const result = await run('pull_request_target', mergedReleaseEvent())
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(skipped)
    expect(await readFile(path.join(cwd, 'output'), 'utf8')).toBe('run=false\nref=\nmode=\nbranch=\n')
  })

  it('不完整 push 输出完整否决结果，main push 输出事件 after 的 prepare 路由', async () => {
    const result = await run('push', {})
    expect(result.status, result.stderr).toBe(0)
    expect(await readFile(path.join(cwd, 'output'), 'utf8')).toBe('run=false\nref=\nmode=\nbranch=\n')
    const main = await run('push', mainPushEvent())
    expect(main.status, main.stderr).toBe(0)
    expect(JSON.parse(main.stdout)).toEqual({ run: true, ref: mergeSha, mode: 'prepare', branch: 'main' })
  })

  it('读取 REPO_RELEASE_MODE 及 REPO_RELEASE_OIDC_AUDIT 并支持显式 output 路径', async () => {
    const output = path.join(cwd, 'custom output')
    const result = await run('workflow_dispatch', {}, { REPO_RELEASE_MODE: 'publish-unpublished' }, ['--github-output', output])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).mode).toBe('publish-unpublished')
    expect(await readFile(output, 'utf8')).toContain('mode=publish-unpublished\n')
    const audit = await run('workflow_dispatch', {}, { REPO_RELEASE_OIDC_AUDIT: 'true' }, [])
    expect(audit.status, audit.stderr).toBe(0)
    expect(JSON.parse(audit.stdout)).toEqual(skipped)
  })

  it('没有 output 文件时拒绝写入，未知参数也失败', async () => {
    const noOutput = await run('workflow_dispatch', {}, { GITHUB_OUTPUT: undefined })
    expect(noOutput.status).not.toBe(0)
    expect(noOutput.stderr).toContain('GITHUB_OUTPUT')
    const unknown = await run('workflow_dispatch', {}, {}, ['--unknown'])
    expect(unknown.status).not.toBe(0)
  })
})
