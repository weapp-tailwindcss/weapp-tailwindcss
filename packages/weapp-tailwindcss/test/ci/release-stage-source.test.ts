import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = path.resolve(import.meta.dirname, '../../../../scripts/ci/release-stage.mjs')

describe('Release 验证产物与版本提交边界', () => {
  let cwd: string
  let harness: string
  let sourceSha: string
  const sourceFile = 'generated index.json'

  function git(...args: string[]) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    return result.stdout.trim()
  }

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(tmpdir(), 'release source boundary '))
    git('init', '--quiet')
    git('config', 'user.name', 'Release Test')
    git('config', 'user.email', 'release-test@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(cwd, sourceFile), '{"headings":["Properties"]}\n')
    await writeFile(path.join(cwd, '.gitignore'), '/build/\n')
    git('add', sourceFile, '.gitignore')
    git('commit', '--quiet', '-m', 'fixture: committed source')
    sourceSha = git('rev-parse', 'HEAD')
    harness = path.join(cwd, '.git', 'release harness')
    await mkdir(harness)
    const fixture = path.join(harness, 'pnpm-fixture.mjs')
    await writeFile(fixture, `
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
appendFileSync(process.env.SOURCE_CALLS, process.argv.at(-1) + '\\n')
if (process.argv.at(-1) === 'verify' && process.env.SOURCE_MUTATION) {
  const file = path.resolve(process.env.SOURCE_MUTATION)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, '{"headings":["Properties","cssOptions?"]}\\n')
  if (process.env.SOURCE_STAGE === '1') execFileSync('git', ['add', '--', file])
}
if (process.env.SOURCE_COMMIT === '1') {
  execFileSync('git', ['commit', '--quiet', '--allow-empty', '-m', 'unexpected verification commit'])
}
process.exitCode = Number(process.env.SOURCE_EXIT || 0)
`)
    if (process.platform === 'win32') {
      await writeFile(path.join(harness, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0pnpm-fixture.mjs" %*\r\n`)
    }
    else {
      await writeFile(path.join(harness, 'pnpm'), `#!/usr/bin/env node\nimport ${JSON.stringify(pathToFileURL(fixture).href)}\n`, { mode: 0o755 })
    }
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  function run(stage: string, extraEnv: NodeJS.ProcessEnv = {}) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'))
    return spawnSync(process.execPath, [script, stage], {
      cwd,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...inherited,
        PATH: `${harness}${path.delimiter}${process.env.PATH || process.env.Path || ''}`,
        CI_RELEASE_SOURCE_SHA: sourceSha,
        CI_RELEASE_BRANCH: 'main',
        GITHUB_SHA: sourceSha,
        GITHUB_REF_NAME: 'main',
        REPO_RELEASE_MODE: 'prepare',
        SOURCE_CALLS: path.join(harness, 'calls'),
        SOURCE_MUTATION: undefined,
        SOURCE_STAGE: undefined,
        SOURCE_COMMIT: undefined,
        SOURCE_EXIT: undefined,
        ...extraEnv,
      },
    })
  }

  it.each(['verify', 'prepare'])('%s 在启动 repoctl 前拒绝已有改动，保留原文件', async (stage) => {
    await writeFile(path.join(cwd, sourceFile), '用户改动\n')
    const result = run(stage)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(sourceFile)
    await expect(readFile(path.join(harness, 'calls'))).rejects.toThrow()
    expect(await readFile(path.join(cwd, sourceFile), 'utf8')).toBe('用户改动\n')
  })

  it.each([
    { file: sourceFile, staged: false },
    { file: sourceFile, staged: true },
    { file: 'new generated.json', staged: false },
    { file: 'new generated.json', staged: true },
  ])('verify 成功但改写 $file（staged=$staged）时阻断后续 prepare', async ({ file, staged }) => {
    const verify = run('verify', { SOURCE_MUTATION: file, SOURCE_STAGE: staged ? '1' : '0' })
    expect(verify.status).not.toBe(0)
    expect(verify.stderr).toContain(file)
    const prepare = run('prepare')
    expect(prepare.status).not.toBe(0)
    expect(await readFile(path.join(harness, 'calls'), 'utf8')).toBe('verify\n')
    expect(git('rev-parse', 'HEAD')).toBe(sourceSha)
    expect(await readFile(path.join(cwd, file), 'utf8')).toContain('cssOptions?')
  })

  it('prepare 拒绝仅 index 改动，即使工作区文件已与 HEAD 一致', async () => {
    const original = await readFile(path.join(cwd, sourceFile))
    await writeFile(path.join(cwd, sourceFile), '已暂存的其他内容\n')
    git('add', sourceFile)
    await writeFile(path.join(cwd, sourceFile), original)
    const result = run('prepare')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(sourceFile)
    await expect(readFile(path.join(harness, 'calls'))).rejects.toThrow()
    expect(git('show', `:${sourceFile}`)).toBe('已暂存的其他内容')
  })

  it('允许忽略的构建产物与本轮 receipt，继续 prepare 且保留产物', async () => {
    await mkdir(path.join(cwd, '.git', 'repoctl-release-ci'))
    await writeFile(path.join(cwd, '.git', 'repoctl-release-ci', 'receipt.json'), '{"done":["plan"]}')
    const verify = run('verify', { SOURCE_MUTATION: path.join('build', 'index.json') })
    expect(verify.status, verify.stderr).toBe(0)
    const prepare = run('prepare')
    expect(prepare.status, prepare.stderr).toBe(0)
    expect(await readFile(path.join(harness, 'calls'), 'utf8')).toBe('verify\nprepare\n')
    expect(await readFile(path.join(cwd, 'build', 'index.json'), 'utf8')).toContain('cssOptions?')
  })

  it('verify 不能提交新的 HEAD 来隐藏验证产物', () => {
    const result = run('verify', { SOURCE_COMMIT: '1' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('HEAD')
  })

  it('verify 本身失败时保留退出码和产物，不执行恢复或 prepare', async () => {
    const result = run('verify', { SOURCE_MUTATION: sourceFile, SOURCE_EXIT: '7' })
    expect(result.status).toBe(7)
    expect(await readFile(path.join(cwd, sourceFile), 'utf8')).toContain('cssOptions?')
    expect(git('rev-parse', 'HEAD')).toBe(sourceSha)
  })
})
