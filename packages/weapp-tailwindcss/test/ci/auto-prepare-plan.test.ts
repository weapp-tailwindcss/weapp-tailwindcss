import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createReleasePlan } from 'repoctl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertCurrentAutomaticPrepare, hasPlannedVersions, parseRemoteMainSha, shouldRunAutomaticPrepare } from '../../../../scripts/ci/auto-prepare-plan.mjs'

const sha = 'a'.repeat(40)
const env = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_REF_NAME: 'main', GITHUB_SHA: sha, REPO_RELEASE_MODE: 'prepare' }
const script = path.resolve(import.meta.dirname, '../../../../scripts/ci/auto-prepare-plan.mjs')
const roots: string[] = []

function fixture(intent?: string) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'weapp auto prepare '))
  roots.push(cwd)
  mkdirSync(path.join(cwd, 'packages', 'core'), { recursive: true })
  mkdirSync(path.join(cwd, '.changeset'))
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@12.9.1' }))
  writeFileSync(path.join(cwd, 'packages', 'core', 'package.json'), '{"name":"@fixture/core","version":"1.0.0"}')
  writeFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  writeFileSync(path.join(cwd, '.changeset', 'ledger.yaml'), '"@fixture/core@1.0.0":\n  dir: packages/core\n  intents: []\n')
  if (intent !== undefined) {
    writeFileSync(path.join(cwd, '.changeset', 'core.md'), intent)
  }
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture')
  git('remote', 'add', 'origin', cwd)
  const head = git('rev-parse', 'HEAD')
  return { cwd, git, head }
}

afterEach(() => {
  for (const cwd of roots.splice(0)) {
    rmSync(cwd, { recursive: true, force: true })
  }
})

describe('自动 prepare 的只读计划边界', () => {
  it('最新 main 的真实未消费 intent 进入官方 plan，empty 则完全跳过', async () => {
    const readRemoteMain = () => `${sha}\trefs/heads/main\n`
    const pending = fixture('---\n"@fixture/core": patch\n---\n准备真实版本。\n')
    const plan = await createReleasePlan({ cwd: pending.cwd, branch: 'main', env: { ...process.env, ...env } })
    expect(plan.status, JSON.stringify(plan.blockers)).toBe('ready')
    expect(plan.packages).toMatchObject([{ name: '@fixture/core', currentVersion: '1.0.0', intents: [{ path: '.changeset/core.md' }] }])
    expect(await shouldRunAutomaticPrepare({ env, cwd: pending.cwd, readRemoteMain })).toBe(true)
    expect(readFileSync(path.join(pending.cwd, 'packages', 'core', 'package.json'), 'utf8')).toContain('1.0.0')
    expect(readFileSync(path.join(pending.cwd, '.changeset', 'core.md'), 'utf8')).toContain('准备真实版本')
    expect(() => readFileSync(path.join(pending.cwd, '.git', 'repoctl-release-ci', 'receipt.json'))).toThrow()
    const empty = fixture()
    expect(await shouldRunAutomaticPrepare({ env, cwd: empty.cwd, readRemoteMain })).toBe(false)
  })

  it.each([
    '---\n"@fixture/missing": patch\n---\n非法包。\n',
    '---\n"@fixture/core": invalid\n---\n非法 bump。\n',
    '---\n"@fixture/core": [\n---\n非法 YAML。\n',
  ])('注册包或 intent 解析失败必须阻断，不能误判 empty', async (intent) => {
    const { cwd } = fixture(intent)
    await expect(shouldRunAutomaticPrepare({ env, cwd, readRemoteMain: () => `${sha}\trefs/heads/main\n` })).rejects.toThrow('阻断')
  })

  it('已消费或 none intent、README 均不触发自动版本 PR', async () => {
    const { cwd } = fixture('---\n"@fixture/core": patch\n---\n已消费 intent。\n')
    writeFileSync(path.join(cwd, '.changeset', 'ledger.yaml'), '"@fixture/core@1.0.0":\n  dir: packages/core\n  intents:\n    - core\n')
    writeFileSync(path.join(cwd, '.changeset', 'README.md'), '作者文档，不是 intent。')
    expect(await shouldRunAutomaticPrepare({ env, cwd, readRemoteMain: () => `${sha}\trefs/heads/main\n` })).toBe(false)
    writeFileSync(path.join(cwd, '.changeset', 'core.md'), '---\n"@fixture/core": none\n---\n无版本变更。\n')
    expect(await shouldRunAutomaticPrepare({ env, cwd, readRemoteMain: () => `${sha}\trefs/heads/main\n` })).toBe(false)
  })

  it('已被新 main 取代的排队 push 不运行只读计划和后续完整 native', async () => {
    const planRelease = vi.fn()
    expect(await shouldRunAutomaticPrepare({ env, cwd: '.', readRemoteMain: () => `${'b'.repeat(40)}\trefs/heads/main\n`, planRelease })).toBe(false)
    expect(planRelease).not.toHaveBeenCalled()
  })

  it('native/quality 期间 main 更新后，prepare 前必须明确失败阻断 force push', async () => {
    const pending = fixture('---\n"@fixture/core": patch\n---\n主分支更新回归。\n')
    const readRemoteMain = vi.fn().mockReturnValue(`${sha}\trefs/heads/main\n`)
    expect(await shouldRunAutomaticPrepare({ env, cwd: pending.cwd, readRemoteMain })).toBe(true)
    expect(() => assertCurrentAutomaticPrepare({ env, readRemoteMain })).not.toThrow()
    readRemoteMain.mockReturnValue(`${'b'.repeat(40)}\trefs/heads/main\n`)
    expect(() => assertCurrentAutomaticPrepare({ env, readRemoteMain })).toThrow('停止过期自动 prepare')
    expect(() => assertCurrentAutomaticPrepare({ env: { ...env, GITHUB_EVENT_NAME: 'pull_request_target' }, readRemoteMain })).not.toThrow()
  })

  it.each(['workflow_dispatch', 'pull_request_target'])('%s 不因 empty 或更新后的 main 阻断手动准备与合并发布', async (eventName) => {
    const planRelease = vi.fn()
    const readRemoteMain = vi.fn()
    expect(await shouldRunAutomaticPrepare({ env: { ...env, GITHUB_EVENT_NAME: eventName, REPO_RELEASE_MODE: 'publish-unpublished' }, cwd: '.', readRemoteMain, planRelease })).toBe(true)
    expect(readRemoteMain).not.toHaveBeenCalled()
    expect(planRelease).not.toHaveBeenCalled()
  })

  it('远端/API 失败不转换为 run=false', async () => {
    await expect(shouldRunAutomaticPrepare({ env, cwd: '.', readRemoteMain: () => {
      throw new Error('network failed')
    } })).rejects.toThrow('network failed')
    await expect(shouldRunAutomaticPrepare({ env, cwd: '.', readRemoteMain: () => `${sha}\trefs/heads/main\n`, planRelease: async () => {
      throw new Error('plan failed')
    } })).rejects.toThrow('plan failed')
  })

  it.each(['', `${sha}\trefs/heads/next\n`, `${sha}\trefs/heads/main\n${sha}\trefs/heads/main\n`, `${'0'.repeat(40)}\trefs/heads/main\n`, `${sha}\nrefs/heads/main\n`, `${sha}\trefs/heads/MAIN\n`])('无法确认唯一远端 main 时失败 %j', (output) => {
    expect(() => parseRemoteMainSha(output)).toThrow('origin/main')
  })

  it('允许 Windows CRLF 和大写 SHA，拒绝异常官方计划', () => {
    expect(parseRemoteMainSha(`${sha.toUpperCase()}\trefs/heads/main\r\n`)).toBe(sha)
    expect(() => hasPlannedVersions({ status: 'empty', schemaVersion: 1, packages: [{}], blockers: [] })).toThrow('官方只读版本计划')
    expect(() => hasPlannedVersions({ status: 'unknown', schemaVersion: 1, packages: [], blockers: [] })).toThrow('官方只读版本计划')
  })
})

describe('自动 prepare 计划 CLI', () => {
  function run(cwd: string, head: string, eventName = 'push', extraEnv: NodeJS.ProcessEnv = {}, args: string[] = []) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        ...env,
        GITHUB_EVENT_NAME: eventName,
        GITHUB_SHA: head,
        GITHUB_REPOSITORY: 'fixture/repo',
        GITHUB_RUN_ID: '100',
        GITHUB_RUN_ATTEMPT: '1',
        CI_RELEASE_SOURCE_SHA: head,
        CI_RELEASE_BRANCH: 'main',
        GITHUB_OUTPUT: path.join(cwd, '.git', 'outputs'),
        GITHUB_STEP_SUMMARY: path.join(cwd, '.git', 'summary'),
        ...extraEnv,
      },
    })
  }

  it('无 pending 的 main push 写 run=false，不创建官方阶段 receipt', () => {
    const { cwd, head } = fixture()
    const result = run(cwd, head)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(path.join(cwd, '.git', 'outputs'), 'utf8')).toBe('run=false\n')
    expect(() => readFileSync(path.join(cwd, '.git', 'repoctl-release-ci', 'receipt.json'))).toThrow()
  })

  it('最新 main 的 pending intent 转交官方 plan 并生成原生 receipt，仅计划不改版本', () => {
    const { cwd, head } = fixture('---\n"@fixture/core": patch\n---\n官方阶段回归。\n')
    const result = run(cwd, head)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(path.join(cwd, '.git', 'outputs'), 'utf8')).toContain('run=true\n')
    const receipt = JSON.parse(readFileSync(path.join(cwd, '.git', 'repoctl-release-ci', 'receipt.json'), 'utf8'))
    expect(receipt).toMatchObject({ schemaVersion: 1, action: 'prepare', publish: false, done: ['plan'] })
    expect(readFileSync(path.join(cwd, 'packages', 'core', 'package.json'), 'utf8')).toContain('1.0.0')
    expect(readFileSync(path.join(cwd, '.changeset', 'core.md'), 'utf8')).toContain('官方阶段回归')
  })

  it('过期 push 同样彻底跳过，远端访问失败与初始 HEAD 漂移不写 skip', () => {
    const { cwd, head, git } = fixture()
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'new main')
    git('checkout', '--detach', head)
    const superseded = run(cwd, head)
    expect(superseded.status, superseded.stderr).toBe(0)
    expect(readFileSync(path.join(cwd, '.git', 'outputs'), 'utf8')).toBe('run=false\n')
    rmSync(path.join(cwd, '.git', 'outputs'))
    const stalePrepare = run(cwd, head, 'push', {}, ['--assert-current-main'])
    expect(stalePrepare.status).not.toBe(0)
    expect(stalePrepare.stderr).toContain('停止过期自动 prepare')
    expect(() => readFileSync(path.join(cwd, '.git', 'outputs'))).toThrow()
    git('remote', 'set-url', 'origin', path.join(cwd, 'missing-origin'))
    const unavailable = run(cwd, head)
    expect(unavailable.status).not.toBe(0)
    expect(() => readFileSync(path.join(cwd, '.git', 'outputs'))).toThrow()
    const drift = run(cwd, 'c'.repeat(40))
    expect(drift.status).not.toBe(0)
    expect(drift.stderr).toContain('HEAD')
  })
})
