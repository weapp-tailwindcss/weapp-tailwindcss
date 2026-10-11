import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveVersionPrContext, resolveVersionPrTarget, validateVersionPrDiff } from '../../../../scripts/ci/version-pr-route.mjs'
import { git, gitFixture, writeFiles } from './release-metadata/fixture'

const repository = 'weapp-tailwindcss/weapp-tailwindcss'
const sha = 'a'.repeat(40)
const base = 'b'.repeat(40)
const context = { repository, sha, currentMainSha: base, eventName: 'pull_request', refName: 'release/pnpm-version', action: 'synchronize', number: 1279 }
const directories: string[] = []

function pullRequest() {
  return {
    number: 1279,
    state: 'open',
    merged_at: null,
    base: { ref: 'main', sha: base, repo: { full_name: repository } },
    head: { ref: 'release/pnpm-version', sha, repo: { full_name: repository } },
  }
}

function event(action = 'synchronize', number = 1279, pr = pullRequest()) {
  return { action, number, pull_request: pr }
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('版本 PR 审批 run 的身份绑定', () => {
  it('从原始 PR 事件绑定作者 head，忽略 Actions 临时 merge SHA', () => {
    expect(resolveVersionPrContext({ eventName: 'pull_request', repository, sha: 'd'.repeat(40), refName: '1279/merge' }, event()))
      .toEqual({ repository, sha, eventName: 'pull_request', refName: 'release/pnpm-version', action: 'synchronize', number: 1279 })
  })

  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])('接受自动创建待审批 run 的 %s 事件', (action) => {
    const derived = resolveVersionPrContext({ eventName: 'pull_request', repository }, event(action))
    expect(resolveVersionPrTarget({ ...derived, currentMainSha: base }, [pullRequest()])).toEqual({ number: 1279, head: sha, base })
  })

  it.each(['closed', 'edited', 'labeled', ''])('拒绝非验收入口 %s', (action) => {
    expect(() => resolveVersionPrContext({ eventName: 'pull_request', repository }, event(action))).toThrow()
  })

  it('事件本身的 PR 编号、外仓、错误目标和残缺结构均拒绝', () => {
    const foreign = pullRequest()
    foreign.head.repo.full_name = 'attacker/weapp-tailwindcss'
    const wrongBase = pullRequest()
    wrongBase.base.ref = 'next'
    for (const pull_request of [foreign, wrongBase, null, {}, { ...pullRequest(), number: 0 }]) {
      expect(() => resolveVersionPrContext({ eventName: 'pull_request', repository }, event('opened', 1279, pull_request))).toThrow()
    }
    expect(() => resolveVersionPrContext({ eventName: 'pull_request', repository }, event('synchronize', 1282))).toThrow()
  })

  it('接受唯一的同仓库 main 版本 PR，并绑定实际 head', () => {
    expect(resolveVersionPrTarget(context, [pullRequest()])).toEqual({ number: 1279, head: sha, base })
  })

  it('PR API 的旧 base SHA 不能替代独立读取的当前 main', () => {
    const currentMainSha = 'c'.repeat(40)
    expect(resolveVersionPrTarget({ ...context, currentMainSha }, [pullRequest()])).toEqual({
      number: 1279,
      head: sha,
      base: currentMainSha,
    })
  })

  it.each([undefined, '', 'main', '0'.repeat(40)])('无法确认当前 main %j 时拒绝', (currentMainSha) => {
    expect(() => resolveVersionPrTarget({ ...context, currentMainSha }, [pullRequest()])).toThrow()
  })

  it.each(['main', 'next', 'codex/fix', 'release/pnpm-version\nhead=main'])('不能从 %j 分支代验', (refName) => {
    expect(() => resolveVersionPrTarget({ ...context, refName }, [pullRequest()])).toThrow('正式')
  })

  it.each(['push', 'workflow_dispatch', 'pull_request_target', 'workflow_run'])('不能由 %s 绕过 PR 审批入口', (eventName) => {
    expect(() => resolveVersionPrTarget({ ...context, eventName }, [pullRequest()])).toThrow('正式')
  })

  it.each(['', 'main', 'c'.repeat(39), `${sha}\nnumber=1`])('拒绝非法 SHA %j', (invalid) => {
    expect(() => resolveVersionPrTarget({ ...context, sha: invalid }, [pullRequest()])).toThrow()
  })

  it.each(['head', 'base'] as const)('拒绝 %s 仓库身份变化', (side) => {
    const pr = pullRequest()
    pr[side].repo.full_name = 'attacker/weapp-tailwindcss'
    expect(() => resolveVersionPrTarget(context, [pr])).toThrow('身份')
  })

  it('当前 PR 已前进时不能用旧审批结果放行', () => {
    const pr = pullRequest()
    pr.head.sha = 'c'.repeat(40)
    expect(() => resolveVersionPrTarget(context, [pr])).toThrow('head 已改变')
  })

  it.each(['closed', 'merged'])('不验收已 %s 的 PR', (state) => {
    const pr = pullRequest()
    pr.state = state
    expect(() => resolveVersionPrTarget(context, [pr])).toThrow('身份')
  })

  it('拒绝已合并标识、非 main 目标或不合法 PR 编号', () => {
    expect(() => resolveVersionPrTarget(context, [{ ...pullRequest(), merged: true }])).toThrow()
    expect(() => resolveVersionPrTarget(context, [{ ...pullRequest(), merged_at: '2026-10-10' }])).toThrow()
    const pr = pullRequest()
    pr.base.ref = 'next'
    expect(() => resolveVersionPrTarget(context, [pr])).toThrow()
    expect(() => resolveVersionPrTarget(context, [{ ...pullRequest(), number: 0 }])).toThrow()
  })

  it.each([[], [pullRequest(), pullRequest()], {}, null])('缺少唯一版本 PR 时拒绝', (records) => {
    expect(() => resolveVersionPrTarget(context, records)).toThrow('唯一')
  })
})

describe('版本专用验收的真实 Git 内容契约', () => {
  function fixture() {
    const data = gitFixture()
    directories.push(data.cwd)
    return data
  }

  it('接受真实 intent 消费、版本、CHANGELOG 和 ledger 同步提交', () => {
    const { cwd, before, after } = fixture()
    expect(() => validateVersionPrDiff({ base: before, head: after }, cwd)).not.toThrow()
  })

  it.each(['source', 'dependency', 'ledger'])('即使版本分支身份正确也拒绝混入 %s', (kind) => {
    const { cwd, before } = fixture()
    const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'packages', 'a', 'package.json'), 'utf8'))
    writeFiles(cwd, kind === 'source'
      ? { 'packages/a/src/index.ts': 'export const changed = true\n' }
      : kind === 'dependency'
        ? { 'packages/a/package.json': JSON.stringify({ ...manifest, dependencies: { extra: '^1.0.0' } }) }
        : { '.changeset/ledger.yaml': '"pkg-a@1.0.1":\n  dir: packages/a\n  intents: [example]\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'chore(release): version packages')
    expect(() => validateVersionPrDiff({ base: before, head: git(cwd, 'rev-parse', 'HEAD') }, cwd)).toThrow('纯版本')
  })

  it('未知 ref 或无变更不得放行', () => {
    const { cwd, before, after } = fixture()
    expect(() => validateVersionPrDiff({ base: 'missing', head: after }, cwd)).toThrow('纯版本')
    expect(() => validateVersionPrDiff({ base: before, head: before }, cwd)).toThrow('纯版本')
  })

  it('main 已前进时等待重新生成，不用旧 main 的版本产物代验', () => {
    const { cwd, before, after } = fixture()
    git(cwd, 'switch', '-c', 'advanced-main', before)
    writeFiles(cwd, { 'packages/a/src/new.ts': 'export const latest = true\n' })
    git(cwd, 'add', '.')
    git(cwd, 'commit', '-m', 'feat: advance main')
    expect(() => validateVersionPrDiff({ base: git(cwd, 'rev-parse', 'HEAD'), head: after }, cwd)).toThrow('必须包含当前 main')
  })
})
