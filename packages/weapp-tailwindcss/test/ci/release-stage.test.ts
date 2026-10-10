import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildStageInvocation } from '../../../../scripts/ci/release-stage.mjs'

const sourceSha = 'a'.repeat(40)
const env = {
  CI_RELEASE_SOURCE_SHA: sourceSha,
  CI_RELEASE_BRANCH: 'main',
  GITHUB_SHA: 'b'.repeat(40),
  GITHUB_REF_NAME: '1282/merge',
  GITHUB_EVENT_NAME: 'pull_request_target',
  GITHUB_OUTPUT: 'stage-output',
  REPO_RELEASE_MODE: 'publish',
}

describe('Release 阶段调用身份', () => {
  it.each(['plan', 'verify', 'prepare', 'upload', 'confirm', 'finalize'])('为 %s 阶段生成固定 repoctl 参数并覆写 child 身份', (stage) => {
    const invocation = buildStageInvocation(stage, { env, headSha: sourceSha, platform: 'linux' })
    expect(invocation).toEqual({
      command: 'pnpm',
      args: ['exec', 'repo', 'release', 'ci', '--stage', stage],
      options: {
        stdio: 'inherit',
        shell: false,
        env: {
          GITHUB_SHA: sourceSha,
          GITHUB_REF_NAME: 'main',
          GITHUB_EVENT_NAME: 'pull_request_target',
          GITHUB_OUTPUT: 'stage-output',
          REPO_RELEASE_MODE: 'publish',
        },
      },
    })
  })

  it.each(['main', 'alpha', 'beta', 'rc', 'next'])('允许 %s 发布线', (branch) => {
    expect(buildStageInvocation('plan', { env: { ...env, CI_RELEASE_BRANCH: branch }, headSha: sourceSha }).options.env.GITHUB_REF_NAME).toBe(branch)
  })

  it.each(['', 'auto', 'oidc-audit', 'plan && echo unsafe'])('拒绝非法阶段 %j', (stage) => {
    expect(() => buildStageInvocation(stage, { env, headSha: sourceSha })).toThrow('发布阶段')
  })

  it.each(['', 'HEAD', 'c'.repeat(39), 'g'.repeat(40), `${sourceSha}\nrun=true`])('拒绝非法 source SHA %j', (sha) => {
    expect(() => buildStageInvocation('plan', { env: { ...env, CI_RELEASE_SOURCE_SHA: sha }, headSha: sourceSha })).toThrow('CI_RELEASE_SOURCE_SHA')
  })

  it.each(['', 'codex/fix', 'main\nrun=true'])('拒绝非法发布线 %j', (branch) => {
    expect(() => buildStageInvocation('plan', { env: { ...env, CI_RELEASE_BRANCH: branch }, headSha: sourceSha })).toThrow('CI_RELEASE_BRANCH')
  })

  it.each(['plan', 'verify'])('%s 拒绝 checkout HEAD 与初始 source SHA 不一致', (stage) => {
    expect(() => buildStageInvocation(stage, { env, headSha: 'c'.repeat(40) })).toThrow('HEAD')
  })

  it.each(['prepare', 'upload', 'confirm', 'finalize'])('%s 交给 repoctl receipt 校验版本提交后的 HEAD', (stage) => {
    const currentHead = 'c'.repeat(40)
    expect(buildStageInvocation(stage, { env, headSha: currentHead }).options.env.GITHUB_SHA).toBe(currentHead)
  })

  it('规范化十六进制大小写，保持同一个 commit 身份', () => {
    expect(buildStageInvocation('plan', { env: { ...env, CI_RELEASE_SOURCE_SHA: sourceSha.toUpperCase() }, headSha: sourceSha }).options.env.GITHUB_SHA).toBe(sourceSha)
  })

  it('Windows 只对固定的 pnpm 调用使用 shell，macOS 和 Linux 均直接 spawn', () => {
    expect(buildStageInvocation('plan', { env, headSha: sourceSha, platform: 'win32' }).options.shell).toBe(true)
    expect(buildStageInvocation('plan', { env, headSha: sourceSha, platform: 'darwin' }).options.shell).toBe(false)
  })

  it('不修改调用者的 env，也不覆盖 repoctl 的恢复 source 配置', () => {
    const recoveryEnv = { ...env, REPO_RELEASE_SOURCE_SHA: 'c'.repeat(40) }
    const before = { ...recoveryEnv }
    expect(buildStageInvocation('plan', { env: recoveryEnv, headSha: sourceSha }).options.env.REPO_RELEASE_SOURCE_SHA).toBe(recoveryEnv.REPO_RELEASE_SOURCE_SHA)
    expect(recoveryEnv).toEqual(before)
  })
})

describe('Release 阶段 CLI', () => {
  let cwd: string
  let headSha: string
  const script = path.resolve(import.meta.dirname, '../../../../scripts/ci/release-stage.mjs')

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'weapp release-stage '))
    for (const args of [
      ['init', '--quiet'],
      ['-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'release fixture'],
    ]) {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
    }
    headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim()
    const fixture = path.join(cwd, 'pnpm-fixture.mjs')
    await writeFile(fixture, `
import { appendFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
writeFileSync(process.env.STAGE_FIXTURE_REPORT, JSON.stringify({
  args: process.argv.slice(2),
  sha: process.env.GITHUB_SHA,
  branch: process.env.GITHUB_REF_NAME,
  event: process.env.GITHUB_EVENT_NAME,
  source: process.env.CI_RELEASE_SOURCE_SHA,
  auxiliaryBranch: process.env.CI_RELEASE_BRANCH,
  mode: process.env.REPO_RELEASE_MODE,
}))
appendFileSync(process.env.GITHUB_OUTPUT, 'run=true\\n')
if (process.env.STAGE_FIXTURE_VERSION_COMMIT === '1') {
  execFileSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'version fixture'])
}
process.exitCode = Number(process.env.STAGE_FIXTURE_EXIT_CODE || 0)
`)
    if (process.platform === 'win32') {
      await writeFile(path.join(cwd, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0pnpm-fixture.mjs" %*\r\n`)
    }
    else {
      await writeFile(path.join(cwd, 'pnpm'), `#!/usr/bin/env node\nimport ${JSON.stringify(pathToFileURL(fixture).href)}\n`, { mode: 0o755 })
    }
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
    const inheritedEnv = { ...process.env }
    for (const key of Object.keys(inheritedEnv)) {
      if (key.toLowerCase() === 'path') {
        delete inheritedEnv[key]
      }
    }
    return spawnSync(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...inheritedEnv,
        PATH: `${cwd}${path.delimiter}${process.env.PATH || process.env.Path || ''}`,
        CI_RELEASE_SOURCE_SHA: headSha,
        CI_RELEASE_BRANCH: 'main',
        GITHUB_SHA: 'b'.repeat(40),
        GITHUB_REF_NAME: '1282/merge',
        GITHUB_EVENT_NAME: 'pull_request_target',
        GITHUB_OUTPUT: path.join(cwd, 'output'),
        REPO_RELEASE_MODE: 'publish',
        STAGE_FIXTURE_REPORT: path.join(cwd, 'invocation.json'),
        STAGE_FIXTURE_EXIT_CODE: undefined,
        STAGE_FIXTURE_VERSION_COMMIT: undefined,
        ...extraEnv,
      },
    })
  }

  it('在真实子进程内覆写 GitHub 默认身份并转交阶段输出', async () => {
    const result = run(['plan'])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(await readFile(path.join(cwd, 'invocation.json'), 'utf8'))).toEqual({
      args: ['exec', 'repo', 'release', 'ci', '--stage', 'plan'],
      sha: headSha,
      branch: 'main',
      event: 'pull_request_target',
      mode: 'publish',
    })
    expect(await readFile(path.join(cwd, 'output'), 'utf8')).toBe('run=true\n')
  })

  it('保持 repoctl 的非零退出码', () => {
    const result = run(['verify'], { STAGE_FIXTURE_EXIT_CODE: '7' })
    expect(result.status, result.stderr).toBe(7)
  })

  it('初始 HEAD 漂移时不启动 pnpm', async () => {
    const result = run(['verify'], { CI_RELEASE_SOURCE_SHA: 'c'.repeat(40) })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('HEAD')
    await expect(readFile(path.join(cwd, 'invocation.json'))).rejects.toThrow()
  })

  it('prerelease prepare 生成版本提交后，后续阶段消费新提交', async () => {
    const prepare = run(['prepare'], { CI_RELEASE_BRANCH: 'beta', REPO_RELEASE_MODE: 'auto', STAGE_FIXTURE_VERSION_COMMIT: '1' })
    expect(prepare.status, prepare.stderr).toBe(0)
    const versionSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim()
    expect(versionSha).not.toBe(headSha)
    const upload = run(['upload'], { CI_RELEASE_BRANCH: 'beta', REPO_RELEASE_MODE: 'auto' })
    expect(upload.status, upload.stderr).toBe(0)
    expect(JSON.parse(await readFile(path.join(cwd, 'invocation.json'), 'utf8'))).toMatchObject({ sha: versionSha, branch: 'beta', mode: 'auto' })
  })

  it.each([{ args: [] }, { args: ['unknown'] }, { args: ['plan', '--mode', 'publish'] }])('拒绝非法 CLI 参数 $args', ({ args }) => {
    const result = run(args)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('发布阶段')
  })
})
