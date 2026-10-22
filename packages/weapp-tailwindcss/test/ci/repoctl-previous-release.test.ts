import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitHubClient, releaseCi } from 'repoctl'
import { afterEach, expect, it, vi } from 'vitest'

const roots: string[] = []
const name = '@fixture/core'
const version = '1.0.0'
const tag = `${name}@${version}`
const release = { id: 12, html_url: 'https://example.test/release/12', tag_name: tag, draft: false, prerelease: false }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function verify(failure?: string, transport: 'cli' | 'http' = 'cli') {
  const cwd = mkdtempSync(join(tmpdir(), 'repoctl-previous-release-'))
  roots.push(cwd)
  mkdirSync(join(cwd, 'packages', 'core'), { recursive: true })
  mkdirSync(join(cwd, '.changeset'))
  writeFileSync(join(cwd, 'package.json'), '{"name":"fixture","private":true}')
  writeFileSync(join(cwd, 'packages', 'core', 'package.json'), JSON.stringify({ name, version }))
  writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  writeFileSync(join(cwd, '.changeset', 'ledger.yaml'), `"${tag}":\n  dir: packages/core\n  intents: []\n`)
  writeFileSync(join(cwd, '.changeset', 'next.md'), `---\n"${name}": patch\n---\n验证准确版本。\n`)
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.test')
  git('add', '.')
  git('commit', '--quiet', '-m', 'chore: prepared fixture')
  const sha = git('rev-parse', 'HEAD')
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    const endpoint = new URL(String(url)).pathname
    if (endpoint.endsWith('/releases')) {
      return json(failure === 'legacy' ? [release] : [])
    }
    if (endpoint.endsWith(`/releases/tags/${encodeURIComponent(tag)}`)) {
      if (failure === 'missing') {
        return json({ message: 'Not Found' }, 404)
      }
      if (failure === 'empty-body') {
        return new Response('', { status: 200 })
      }
      if (failure === 'array') {
        return json([])
      }
      if (failure === 'permission') {
        return json({ message: 'Forbidden' }, 403)
      }
      return json({ ...release, tag_name: failure === 'wrong-tag' ? '@other/pkg@1.0.0' : tag, draft: failure === 'draft', prerelease: failure === 'prerelease' })
    }
    if (endpoint.endsWith(`/git/ref/tags/${encodeURIComponent(tag)}`)) {
      return json({ object: { type: 'commit', sha: failure === 'tag-conflict' ? 'f'.repeat(40) : sha } })
    }
    throw new Error(`未登记的 GitHub 请求：${endpoint}`)
  })
  const github = new GitHubClient({ token: 'fixture', repository: 'fixture/repo', fetch, retryAttempts: 1 })
  if (failure === 'legacy') {
    Object.defineProperty(github, 'readRelease', { value: undefined })
  }
  const registryFetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url) === `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`) {
      return failure === 'registry-missing' ? json({}, 404) : json({ name, version, gitHead: sha })
    }
    if (String(url) === `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`) {
      return json({ latest: version })
    }
    throw new Error(`未登记的 registry 请求：${url}`)
  })
  vi.spyOn(github, 'readReleaseState').mockResolvedValue(failure === 'checkpoint'
    ? {
        revision: sha,
        state: { schemaVersion: 1, complete: false, packages: [{ name, version, target: sha }] },
      } as Awaited<ReturnType<typeof github.readReleaseState>>
    : undefined)
  const options = {
    cwd,
    branch: 'main',
    mode: 'prepare' as const,
    env: {
      GITHUB_REPOSITORY: 'fixture/repo',
      GITHUB_REF_NAME: 'main',
      GITHUB_SHA: sha,
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
      npm_config_registry: 'https://registry.npmjs.org/',
      npm_config_userconfig: join(cwd, 'user.npmrc'),
      npm_config_globalconfig: join(cwd, 'global.npmrc'),
    },
    config: { qualityScripts: [] },
    github,
    ...(transport === 'http' ? { registryFetch } : {}),
    spawn: ((command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> => {
      if (command === 'npm') {
        if (transport === 'http' || args[0] !== 'view') {
          throw new Error(`不应执行 npm ${args.join(' ')}`)
        }
        return { status: 0, signal: null, pid: 0, output: [], stdout: JSON.stringify({ name, version, gitHead: sha }), stderr: '' }
      }
      return spawnSync(command, args, { ...options, encoding: 'utf8', stdio: 'pipe' })
    }) as typeof spawnSync,
  }
  await releaseCi({ ...options, stage: 'plan' })
  const result = releaseCi({ ...options, stage: 'verify' })
  return { result, fetch, registryFetch }
}

it.each(['cli', 'http'] as const)('registry %s 的分页列表为空时按准确 tag 验证已有 Release', async (transport) => {
  const { result, fetch, registryFetch } = await verify(undefined, transport)
  await expect(result).resolves.toMatchObject({ done: ['plan', 'verify'] })
  expect(fetch.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/releases'))).toBe(false)
  expect(fetch.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true)
  expect(registryFetch.mock.calls.map(([url]) => String(url))).toEqual(transport === 'http'
    ? [`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`]
    : [])
})

it('registry HTTP 明确缺失时仍拒绝消费新 intent', async () => {
  const { result } = await verify('registry-missing', 'http')
  await expect(result).rejects.toThrow('Prepared releases must finish')
})

it('旧注入客户端保留 listReleases 兼容门禁', async () => {
  const { result, fetch } = await verify('legacy')
  await expect(result).resolves.toMatchObject({ done: ['plan', 'verify'] })
  expect(fetch.mock.calls.some(([url]) => new URL(String(url)).pathname.endsWith('/releases'))).toBe(true)
})

it.each(['missing', 'draft', 'prerelease', 'checkpoint', 'tag-conflict'])('精确查询保留 %s 拒绝门禁', async (failure) => {
  const { result } = await verify(failure)
  await expect(result).rejects.toThrow('Prepared releases must finish')
})

it.each(['empty-body', 'array', 'wrong-tag'])('精确查询的 %s 不是明确缺失，必须按未知响应阻断', async (failure) => {
  const { result } = await verify(failure)
  await expect(result).rejects.toThrow('invalid release response')
})

it('权限失败保留 403，不能写成 Release 不存在', async () => {
  const { result } = await verify('permission')
  await expect(result).rejects.toMatchObject({ status: 403 })
})
