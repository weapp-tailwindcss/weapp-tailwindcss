import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { GitHubClient, repairReleaseNotes } from 'repoctl'
import { afterEach, describe, expect, it, vi } from 'vitest'

const tag = '@fixture/pkg@1.0.0'
const release = { id: 12, tag_name: tag, name: tag }
const request = { tag, target: 'a'.repeat(40), body: '发布说明' }
const response = (status: number, data: unknown, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers })

function createClient(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) {
  return new GitHubClient({ token: 'test', repository: 'fixture/repo', fetch, retryDelay: 1, ...extra })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('repoctl GitHub Release 恢复补丁', () => {
  it.each([429, 500, 502])('POST 返回 %s 后按 tag 查询结果，避免重复创建 Release', async (failure) => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(response(failure, {}))
      .mockResolvedValueOnce(response(200, release))
    const pending = createClient(fetch).ensureRelease(request)
    const result = expect(pending).resolves.toMatchObject(release)
    await vi.runAllTimersAsync()
    await result
    expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'POST', 'GET'])
    expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  })

  it('网络错误不在 request 层重试 POST，改为按 tag 恢复', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(404, {}))
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(response(200, release))
    expect(await createClient(fetch).ensureRelease(request)).toMatchObject(release)
    expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'POST', 'GET'])
  })

  it('POST 响应丢失后发现 Release 已创建时直接恢复', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(404, {}))
      .mockResolvedValueOnce(response(502, {}))
      .mockResolvedValueOnce(response(200, release))
    expect(await createClient(fetch, { retryAttempts: 1 }).ensureRelease(request)).toMatchObject(release)
    expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  })

  it.each(['seconds', 'date', 'reset'])('PATCH 遵守限流等待提示 %s，等待前不再次写入', async (hint) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'))
    const start = Date.now()
    const headers = hint === 'seconds'
      ? { 'retry-after': '5' }
      : hint === 'date'
        ? { 'retry-after': new Date(start + 5000).toUTCString() }
        : { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String((start + 5000) / 1000) }
    const fetch = vi.fn()
      .mockResolvedValueOnce(response(200, release))
      .mockResolvedValueOnce(response(429, {}, headers))
      .mockResolvedValueOnce(response(200, release))
    const pending = createClient(fetch).ensureRelease(request)
    const result = expect(pending).resolves.toMatchObject(release)
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.runAllTimersAsync()
    await result
    expect(Date.now() - start).toBe(5000)
    expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PATCH', 'PATCH'])
  })

  it.each(['body-read', 'invalid-json'])('POST 的 %s 响应不确定时按 tag 恢复', async (failure) => {
    const broken = failure === 'body-read'
      ? { text: async () => {
          throw new TypeError('socket closed')
        } }
      : new Response('truncated JSON', { status: 201 })
    const fetch = vi.fn().mockResolvedValueOnce(response(404, {})).mockResolvedValueOnce(broken).mockResolvedValueOnce(response(200, release))
    expect(await createClient(fetch, failure === 'body-read' ? { retryAttempts: 1 } : {}).ensureRelease(request)).toMatchObject(release)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('现有 Release 的 PATCH 操作也有界重试', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValueOnce(response(200, release)).mockResolvedValueOnce(response(502, {})).mockResolvedValueOnce(response(200, release))
    const result = expect(createClient(fetch).ensureRelease(request)).resolves.toMatchObject(release)
    await vi.runAllTimersAsync()
    await result
    expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'PATCH', 'PATCH'])
  })

  it.each(['list', 'update'])('说明修复入口的 %s 操作同样重试瞬时失败', async (operation) => {
    vi.useFakeTimers()
    const expected = operation === 'list' ? [release] : release
    const fetch = vi.fn().mockResolvedValueOnce(response(502, {})).mockResolvedValueOnce(response(200, expected))
    const client = createClient(fetch)
    const pending = operation === 'list' ? client.listReleases() : client.updateRelease({ id: release.id, name: tag, body: request.body })
    const result = expect(pending).resolves.toEqual(expected)
    await vi.runAllTimersAsync()
    await result
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('最多尝试四次 PATCH，并保留失败结果', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async (_url, init) => response(init.method === 'GET' ? 200 : 502, release))
    const pending = createClient(fetch).ensureRelease(request)
    const result = expect(pending).rejects.toMatchObject({ status: 502 })
    await vi.runAllTimersAsync()
    await result
    expect(fetch.mock.calls.filter(call => call[1].method === 'PATCH')).toHaveLength(4)
    expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(0)
  })

  it.each([401, 403])('不重试永久权限错误 %s', async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(response(404, {})).mockResolvedValueOnce(response(status, {}))
    await expect(createClient(fetch).ensureRelease(request)).rejects.toMatchObject({ status })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('保留 422 并发创建恢复行为', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(404, {})).mockResolvedValueOnce(response(422, {})).mockResolvedValueOnce(response(200, release))
    expect(await createClient(fetch).ensureRelease(request)).toMatchObject(release)
  })

  it('普通 422 校验失败只查询一次，不再次创建', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(404, {})).mockResolvedValueOnce(response(422, {})).mockResolvedValueOnce(response(404, {}))
    await expect(createClient(fetch).ensureRelease(request)).rejects.toThrow()
    expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(1)
  })
})

describe('repoctl 缺失 Release 对账', () => {
  it.each([true, false])('dryRun=%s 时只对账已发布版本，不执行 npm publish', async (dryRun) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'repoctl-recovery-'))
    try {
      await mkdir(path.join(cwd, 'packages', 'fixture'), { recursive: true })
      await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'recovery-workspace', private: true }))
      await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      await writeFile(path.join(cwd, 'packages', 'fixture', 'package.json'), JSON.stringify({ name: '@fixture/pkg', version: '1.0.0' }))
      const changelog = '# @fixture/pkg\n\n## 1.0.0\n\n### Patch Changes\n\n- 修复变量丢失。\n'
      await writeFile(path.join(cwd, 'packages', 'fixture', 'CHANGELOG.md'), changelog)
      const calls: string[][] = []
      const spawn = vi.fn((command, args) => {
        calls.push([command, ...args])
        let stdout = ''
        if ((command === 'pnpm' || command === 'npm') && args[0] === 'view') {
          stdout = JSON.stringify({ version: '1.0.0', gitHead: request.target })
        }
        else if (command === 'git' && args[0] === 'rev-parse') {
          stdout = request.target
        }
        else if (command === 'git' && args[0] === 'ls-remote') {
          stdout = `${request.target}\trefs/tags/${tag}`
        }
        else if (command === 'git' && args[0] === 'ls-tree') {
          stdout = '100644 blob fixture\tpackages/fixture/CHANGELOG.md'
        }
        else if (command === 'git' && args[0] === 'show' && args[1].endsWith('package.json')) {
          stdout = JSON.stringify({ name: '@fixture/pkg', version: '1.0.0' })
        }
        else if (command === 'git' && args[0] === 'show') {
          stdout = changelog
        }
        else { throw new Error(`Unexpected command: ${command} ${args.join(' ')}`) }
        return { status: 0, stdout, stderr: '', pid: 1, output: [], signal: null }
      })
      const ensureRelease = vi.fn(async (_options: { body?: string }) => release)
      const github = { listReleases: vi.fn(async (): Promise<Array<typeof release & { body?: string }>> => []), updateRelease: vi.fn(), ensureRelease }
      const result = await repairReleaseNotes({ cwd, tag, createMissing: true, dryRun, spawn: spawn as never, github })
      expect(result.repaired).toEqual(dryRun ? [] : [tag])
      expect(ensureRelease).toHaveBeenCalledTimes(dryRun ? 0 : 1)
      expect(calls.some(call => call.includes('publish'))).toBe(false)
      expect(calls).toContainEqual(['npm', 'view', tag, '--json'])
      expect(github.updateRelease).not.toHaveBeenCalled()
      if (!dryRun) {
        github.listReleases.mockResolvedValue([{ ...release, body: ensureRelease.mock.calls[0]![0].body }])
        await repairReleaseNotes({ cwd, tag, createMissing: true, spawn: spawn as never, github })
        expect(ensureRelease).toHaveBeenCalledTimes(1)
        expect(github.updateRelease).not.toHaveBeenCalled()
      }
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it.each(['npm', 'remote-tag', 'tagged-version'])('拒绝 %s 对账不一致，并且不写入 GitHub', async (mismatch) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'repoctl-recovery-mismatch-'))
    try {
      await mkdir(path.join(cwd, 'packages', 'fixture'), { recursive: true })
      await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'recovery-workspace', private: true }))
      await writeFile(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      await writeFile(path.join(cwd, 'packages', 'fixture', 'package.json'), JSON.stringify({ name: '@fixture/pkg', version: '1.0.0' }))
      const spawn = vi.fn((command, args) => {
        let stdout = ''
        if ((command === 'pnpm' || command === 'npm') && args[0] === 'view') {
          stdout = JSON.stringify({ version: mismatch === 'npm' ? '0.9.0' : '1.0.0', gitHead: request.target })
        }
        else if (command === 'git' && args[0] === 'rev-parse') {
          stdout = request.target
        }
        else if (command === 'git' && args[0] === 'ls-remote') {
          stdout = `${mismatch === 'remote-tag' ? 'b'.repeat(40) : request.target}\trefs/tags/${tag}`
        }
        else if (command === 'git' && args[0] === 'show') {
          stdout = JSON.stringify({ name: '@fixture/pkg', version: mismatch === 'tagged-version' ? '0.9.0' : '1.0.0' })
        }
        else if (command === 'git' && args[0] === 'ls-tree') {
          stdout = ''
        }
        else { throw new Error(`Unexpected command: ${command} ${args.join(' ')}`) }
        return { status: 0, stdout, stderr: '', pid: 1, output: [], signal: null }
      })
      const github = { listReleases: vi.fn(async () => []), updateRelease: vi.fn(), ensureRelease: vi.fn() }
      const expectedError = mismatch === 'npm'
        ? 'npm returned invalid metadata'
        : mismatch === 'remote-tag' ? 'Tag target conflict' : 'Original commit does not contain'
      await expect(repairReleaseNotes({ cwd, tag, createMissing: true, spawn: spawn as never, github })).rejects.toThrow(expectedError)
      expect(github.ensureRelease).not.toHaveBeenCalled()
      expect(github.updateRelease).not.toHaveBeenCalled()
      expect(spawn.mock.calls.some(([command, args]) => (command === 'pnpm' || command === 'npm') && args.includes('publish'))).toBe(false)
    }
    finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
