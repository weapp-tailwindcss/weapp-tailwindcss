import { describe, expect, it, vi } from 'vitest'
import { buildReleaseDispatch, loadMergedVersionPr } from '../../../../scripts/ci/release-dispatch.mjs'
import { resolveReleaseRoute } from '../../../../scripts/ci/release-route.mjs'

const repository = 'weapp-tailwindcss/weapp-tailwindcss'
const mergeSha = 'b'.repeat(40)
const currentSha = 'a'.repeat(40)
const pullRequest = {
  number: 1279,
  state: 'closed',
  merged: true,
  merge_commit_sha: mergeSha,
  base: { ref: 'main', repo: { full_name: repository } },
  head: { ref: 'release/pnpm-version', repo: { full_name: repository } },
}
const event = { action: 'closed', repository: { full_name: repository }, pull_request: pullRequest }
const context = { repository, sha: currentSha, refName: 'main', mode: 'publish', versionPr: '1279', pullRequest }

describe('已合并版本 PR 的受信任发布调度', () => {
  it('PR 事件只请求 main 的 release.yml，不传入任意 SHA 或其他工作流', () => {
    expect(buildReleaseDispatch(event, repository)).toEqual({
      workflow: 'release.yml',
      body: { ref: 'main', inputs: { mode: 'publish', version_pr: '1279' } },
    })
  })

  it.each([
    { ...event, action: 'opened' },
    { ...event, repository: { full_name: 'other/repository' } },
    { ...event, pull_request: { ...pullRequest, merged: false } },
    { ...event, pull_request: { ...pullRequest, number: 0 } },
    { ...event, pull_request: { ...pullRequest, head: { ...pullRequest.head, ref: 'ordinary' } } },
    { ...event, pull_request: { ...pullRequest, base: { ...pullRequest.base, ref: 'next' } } },
  ])('非法 PR 不得创建发布请求 %#', (payload) => {
    expect(() => buildReleaseDispatch(payload, repository)).toThrow()
  })

  it('子运行重新从 API 获取 PR，并确认 merge SHA 属于 main 历史', async () => {
    const readPullRequest = vi.fn().mockResolvedValue(pullRequest)
    const isMainAncestor = vi.fn().mockReturnValue(true)
    expect(await loadMergedVersionPr('1279', repository, { readPullRequest, isMainAncestor })).toEqual(pullRequest)
    expect(readPullRequest).toHaveBeenCalledWith(repository, 1279)
    expect(isMainAncestor).toHaveBeenCalledWith(mergeSha)
  })

  it.each(['0', '-1', '1.5', '1279\nmode=auto', '01279', 'main'])('拒绝非法 PR 编号 %j', async (number) => {
    const readPullRequest = vi.fn()
    await expect(loadMergedVersionPr(number, repository, { readPullRequest })).rejects.toThrow()
    expect(readPullRequest).not.toHaveBeenCalled()
  })

  it.each([
    { ...pullRequest, number: 1280 },
    { ...pullRequest, state: 'open' },
    { ...pullRequest, merged: false },
    { ...pullRequest, merge_commit_sha: 'main' },
    { ...pullRequest, head: { ...pullRequest.head, repo: { full_name: 'attacker/repo' } } },
  ])('拒绝 API 返回的错误或未合并身份 %#', async (result) => {
    await expect(loadMergedVersionPr('1279', repository, {
      readPullRequest: async () => result,
      isMainAncestor: () => true,
    })).rejects.toThrow()
  })

  it('网络失败和 main 祖先检查失败均阻断，不退回当前 main 发布', async () => {
    await expect(loadMergedVersionPr('1279', repository, {
      readPullRequest: async () => { throw new Error('network failure') },
    })).rejects.toThrow('network failure')
    await expect(loadMergedVersionPr('1279', repository, {
      readPullRequest: async () => pullRequest,
      isMainAncestor: () => false,
    })).rejects.toThrow('main')
  })

  it('main 即使已前进，发布 checkout 仍绑定 API 确认的准确 merge SHA', () => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, context)).toEqual({
      run: true, ref: mergeSha, mode: 'publish', branch: 'main',
    })
  })

  it.each([
    { ...context, refName: 'next' },
    { ...context, mode: 'prepare' },
    { ...context, mode: 'publish-unpublished' },
    { ...context, pullRequest: undefined },
    { ...context, pullRequest: { ...pullRequest, number: 1280 } },
  ])('版本 PR 输入不得降级为任意分支或模式的发布 %#', (options) => {
    expect(resolveReleaseRoute('workflow_dispatch', {}, options).run).toBe(false)
  })
})
