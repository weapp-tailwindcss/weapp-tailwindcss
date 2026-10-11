import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../../..')
const require = createRequire(path.join(root, 'package.json'))
const manifestPath = require.resolve('repoctl/package.json')
const cli = path.join(path.dirname(manifestPath), require(manifestPath).bin.repo)
const scripts = require(path.join(root, 'package.json')).scripts as Record<string, string>
let cwd: string

beforeEach(async () => {
  cwd = await mkdtemp(path.join(tmpdir(), 'weapp-npmmirror-'))
  await writeFile(path.join(cwd, 'preload.mjs'), `
import { appendFileSync } from 'node:fs'
import path from 'node:path'
globalThis.fetch = async (url, init = {}) => {
  appendFileSync(path.join(process.cwd(), 'requests.jsonl'), JSON.stringify({ url, method: init.method || 'GET', body: init.body }) + '\\n')
  if (String(url).includes('/syncs')) {
    return Response.json({ ok: true, id: 'pilot-task', state: process.env.TASK_STATE || 'success', error: 'mirror unavailable' })
  }
  return Response.json({ versions: { '1.0.0': {} }, 'dist-tags': { next: '1.0.0' } })
}
`)
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [
    '--import',
    pathToFileURL(path.join(cwd, 'preload.mjs')).href,
    cli,
    ...scripts['release:sync-npmmirror']!.split(' ').slice(1),
  ], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CONSOLA_LEVEL: '3',
      REPO_RELEASE_PUBLISH_SUMMARY: undefined,
      GITHUB_STEP_SUMMARY: undefined,
      NO_COLOR: '1',
      ...env,
    },
  })
}

describe('已安装 repoctl 的 npmmirror 发布同步', () => {
  it('通过真实发布入口同步普通包和 scoped 包，并核验镜像元数据', async () => {
    const result = run({ REPO_RELEASE_PUBLISHED_PACKAGES: JSON.stringify([
      { name: 'weapp-tailwindcss', version: '1.0.0' },
      { name: '@weapp-tailwindcss/typography', version: '1.0.0' },
    ]) })
    expect(result.status, result.stderr).toBe(0)
    const calls = (await readFile(path.join(cwd, 'requests.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(calls.filter(call => call.method === 'PUT').map(call => call.url)).toEqual([
      'https://registry-direct.npmmirror.com/-/package/weapp-tailwindcss/syncs',
      'https://registry-direct.npmmirror.com/-/package/%40weapp-tailwindcss%2Ftypography/syncs',
    ])
    expect(calls.filter(call => call.url.startsWith('https://registry.npmmirror.com/'))).toHaveLength(2)
    expect(result.stdout).toContain('npmmirror success: @weapp-tailwindcss/typography@1.0.0')
  })

  it('空发布列表跳过同步且不请求网络', async () => {
    const result = run({ REPO_RELEASE_PUBLISHED_PACKAGES: '[]' })
    expect(result.status, result.stderr).toBe(0)
    await expect(readFile(path.join(cwd, 'requests.jsonl'))).rejects.toThrow()
  })

  it('镜像失败输出 CI 告警及可执行的补同步命令', async () => {
    const summary = path.join(cwd, 'summary.md')
    const result = run({
      REPO_RELEASE_PUBLISHED_PACKAGES: '[{"name":"weapp-tailwindcss","version":"1.0.0"}]',
      TASK_STATE: 'error',
      GITHUB_ACTIONS: 'true',
      GITHUB_STEP_SUMMARY: summary,
    })
    expect(result.status, result.stderr).toBe(1)
    expect(result.stdout).toContain('::warning::')
    expect(await readFile(summary, 'utf8')).toContain('pnpm exec repo release sync-npmmirror --package weapp-tailwindcss --version 1.0.0')
  })
})
