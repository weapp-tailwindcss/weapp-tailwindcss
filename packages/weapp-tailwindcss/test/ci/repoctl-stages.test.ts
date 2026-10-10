import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { auditReleaseOidc, releaseCi } from 'repoctl'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function fixture(pending = false) {
  const root = mkdtempSync(join(tmpdir(), 'repoctl-stages-'))
  roots.push(root)
  mkdirSync(join(root, 'packages', 'core'), { recursive: true })
  mkdirSync(join(root, '.changeset'))
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}')
  writeFileSync(join(root, 'packages', 'core', 'package.json'), '{"name":"@fixture/core","version":"1.0.0"}')
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  if (pending) {
    writeFileSync(join(root, '.changeset', 'core.md'), '---\n"@fixture/core": patch\n---\n发布阶段回归。\n')
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore: initial fixture')
  writeFileSync(join(root, 'README.md'), '文档变更')
  git('add', 'README.md')
  git('commit', '--quiet', '-m', 'docs: update fixture')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_REPOSITORY: 'fixture/repo',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF_NAME: 'main',
    GITHUB_SHA: git('rev-parse', 'HEAD'),
    GITHUB_RUN_ID: '100',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_OUTPUT: join(root, '.git', 'outputs'),
    GITHUB_STEP_SUMMARY: join(root, '.git', 'summary'),
    REPO_RELEASE_MODE: 'auto',
  }
  const github = {
    readReleaseState: vi.fn().mockResolvedValue(undefined),
    writeReleaseState: vi.fn().mockResolvedValue('revision'),
    ensurePullRequest: vi.fn().mockResolvedValue({ number: 1, html_url: 'https://example.test/pr/1' }),
    ensureRelease: vi.fn(),
  }
  const spawn = vi.fn((command: string, args: readonly string[] = [], options: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8' }): SpawnSyncReturns<string> => {
    if (command === 'pnpm' && args?.[0] === 'version') {
      writeFileSync(join(root, 'packages', 'core', 'package.json'), '{"name":"@fixture/core","version":"1.0.1"}')
      writeFileSync(join(root, 'packages', 'core', 'CHANGELOG.md'), '# @fixture/core\n\n## 1.0.1\n\n### Patch Changes\n\n- 发布阶段回归。\n')
      rmSync(join(root, '.changeset', 'core.md'))
      return { status: 0, signal: null, pid: 0, output: [], stderr: '', stdout: JSON.stringify([
        { name: '@fixture/core', currentVersion: '1.0.0', newVersion: '1.0.1' },
      ]) }
    }
    if (command === 'pnpm' || (command === 'git' && args?.[0] === 'push')) {
      return { status: 0, signal: null, pid: 0, output: [], stdout: '', stderr: '' }
    }
    return spawnSync(command, args, { ...options, encoding: 'utf8', stdio: 'pipe' })
  })
  return {
    root,
    options: {
      cwd: root,
      branch: 'main',
      env,
      github,
      spawn: spawn as typeof spawn & typeof spawnSync,
      config: { qualityScripts: ['fixture:quality'], hooks: { verify: ['fixture:verify'] } },
      registryFetch: vi.fn().mockResolvedValue(new Response('{}', { status: 404 })),
    },
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('repoctl 5.10 真实阶段 API', () => {
  it('手动预发布 auto 由官方计划选择 prerelease，prepare 在预发布线明确拒绝', async () => {
    const { options } = fixture(true)
    const prerelease = {
      ...options,
      branch: 'beta',
      env: { ...options.env, GITHUB_REF_NAME: 'beta', GITHUB_EVENT_NAME: 'workflow_dispatch', REPO_RELEASE_MODE: 'auto' },
    }
    expect(await releaseCi({ ...prerelease, stage: 'plan' })).toMatchObject({ action: 'prerelease' })
    const stableOnly = { ...prerelease, env: { ...prerelease.env, REPO_RELEASE_MODE: 'prepare' } }
    expect(await releaseCi({ ...stableOnly, stage: 'plan' })).toMatchObject({ action: 'prepare' })
    await expect(releaseCi({ ...stableOnly, stage: 'verify' })).rejects.toThrow('Stable preparation requires a stable release branch')
    expect(options.github.ensurePullRequest).not.toHaveBeenCalled()
    expect(options.spawn.mock.calls.some(([command]) => command === 'pnpm')).toBe(false)
  })

  it('官方 OIDC 审计只交换公开包凭据，报告不保存任何 token', async () => {
    const { root, options } = fixture()
    const workflow = 'fixture/repo/.github/workflows/release.yml@refs/heads/main'
    const claims = { iss: 'https://token.actions.githubusercontent.com', aud: 'npm:registry.npmjs.org', repository: 'fixture/repo', workflow_ref: workflow, runner_environment: 'github-hosted' }
    const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: token })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'npm-short-lived-secret' }), { status: 201 }))
    const report = await auditReleaseOidc({ cwd: root, env: {
      ...options.env,
      GITHUB_WORKFLOW_REF: workflow,
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.test/oidc',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-secret',
    }, fetch })
    expect(report).toMatchObject({ ok: true, results: [{ package: '@fixture/core', ok: true, status: 201 }] })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(fetch.mock.calls[1]?.[0])).toContain('exchange/package/%40fixture%2Fcore')
    for (const secret of [token, 'request-secret', 'npm-short-lived-secret']) {
      expect(JSON.stringify(report)).not.toContain(secret)
    }
    expect(options.spawn).not.toHaveBeenCalled()
    expect(options.github.writeReleaseState).not.toHaveBeenCalled()
  })

  it('无 intent 的普通 push 输出 run=false，不执行质量脚本或 GitHub 写入', async () => {
    const { root, options } = fixture()
    expect(await releaseCi({ ...options, stage: 'plan' })).toMatchObject({ action: 'skip', publish: false })
    expect(readFileSync(options.env.GITHUB_OUTPUT!, 'utf8')).toContain('run=false')
    expect(readFileSync(join(root, 'repoctl-ci-progress.json'), 'utf8')).toContain('elapsedMs')
    expect(options.spawn.mock.calls.some(([command]) => command === 'pnpm')).toBe(false)
    expect(options.github.writeReleaseState).not.toHaveBeenCalled()
    expect(options.github.ensurePullRequest).not.toHaveBeenCalled()
  })

  it('prepare 只验证一次质量，后续准备阶段不会重复执行', async () => {
    const { options } = fixture(true)
    expect(await releaseCi({ ...options, stage: 'plan' })).toMatchObject({ action: 'prepare' })
    await releaseCi({ ...options, stage: 'verify' })
    expect(await releaseCi({ ...options, stage: 'prepare' })).toMatchObject({ publish: false, done: ['plan', 'verify', 'prepare'] })
    const scripts = options.spawn.mock.calls.filter(([command, args]) => command === 'pnpm' && args?.[0] === 'run').map(([, args]) => args?.[1])
    expect(scripts).toEqual(['fixture:quality', 'fixture:verify'])
    expect(options.github.ensurePullRequest).toHaveBeenCalledOnce()
    expect(options.spawn.mock.calls.some(([command, args]) => command === 'pnpm' && args?.includes('publish'))).toBe(false)
  })

  it('质量验证失败后无法准备、push 或 publish', async () => {
    const { options } = fixture(true)
    const original = options.spawn.getMockImplementation()!
    options.spawn.mockImplementation((command, args, settings) => command === 'pnpm'
      ? { status: 1, signal: null, pid: 0, output: [], stdout: '', stderr: 'quality failed' }
      : original(command, args, settings))
    await releaseCi({ ...options, stage: 'plan' })
    await expect(releaseCi({ ...options, stage: 'verify' })).rejects.toThrow()
    await expect(releaseCi({ ...options, stage: 'prepare' })).rejects.toThrow('preceding stage')
    expect(options.github.ensurePullRequest).not.toHaveBeenCalled()
    expect(options.spawn.mock.calls.some(([command, args]) => command === 'git' && args?.[0] === 'push')).toBe(false)
  })

  it.each(['source', 'configuration', 'attempt', 'selection'])('阶段间 %s 变化时拒绝过期授权', async (change) => {
    const { root, options } = fixture()
    await releaseCi({ ...options, stage: 'plan' })
    const changed = { ...options }
    if (change === 'source') {
      writeFileSync(join(root, 'README.md'), '阶段间源码发生变化')
    }
    else if (change === 'configuration') {
      changed.config = { qualityScripts: ['different:quality'], hooks: { verify: [] } }
    }
    else if (change === 'attempt') {
      changed.env = { ...options.env, GITHUB_RUN_ATTEMPT: '2' }
    }
    else {
      changed.env = { ...options.env, REPO_RELEASE_PACKAGE: '@fixture/core' }
    }
    await expect(releaseCi({ ...changed, stage: 'verify' })).rejects.toThrow('Stale release stage receipt')
  })

  it('未验证就跳到 upload 时拒绝执行', async () => {
    const { options } = fixture()
    await releaseCi({ ...options, stage: 'plan' })
    await expect(releaseCi({ ...options, stage: 'upload' })).rejects.toThrow('preceding stage')
    expect(options.github.writeReleaseState).not.toHaveBeenCalled()
  })
})
