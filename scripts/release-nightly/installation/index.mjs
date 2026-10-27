import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { execaPnpm } from '../../pnpm-exec.mjs'
import { installationEnvironment } from './environment.mjs'
import { missingBatchVersion } from './missing-version.mjs'

function exactBatch(report) {
  assert.equal(report.status, 'published')
  assert.equal(report.confirmed, true)
  assert.equal(report.snapshot?.registry, 'https://registry.npmjs.org/')
  assert.ok(report.packages?.length)
  const expected = new Set()
  for (const pkg of report.packages) {
    assert.equal(pkg.published, true)
    assert.match(pkg.name, /^(?:@[\w.~-]+\/)?[\w.~-]+$/)
    assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[a-z\d.-]+)?(?:\+[a-z\d.-]+)?$/i)
    expected.add(`${pkg.name}@${pkg.version}`)
  }
  assert.equal(expected.size, report.packages.length)
  return expected
}

function diagnostics(result) {
  return Object.fromEntries(['exitCode', 'signal', 'timedOut', 'isCanceled', 'isTerminated', 'isMaxBuffer', 'isForcefullyTerminated', 'code', 'shortMessage', 'stdout', 'stderr']
    .filter(key => result?.[key] !== undefined).map(key => [key, result[key]]))
}

/** 重试安装可见性，不重新上传，也不重新解释本轮发布身份。 */
export async function installPublishedNightly(report, directory, evidenceFile, options = {}) {
  const expected = exactBatch(report)
  const run = options.run ?? execaPnpm
  const sleep = options.sleep ?? setTimeout
  const now = options.now ?? (() => performance.now())
  const budget = options.budgetMs ?? 300_000
  const maxAttempts = options.maxAttempts ?? 6
  const commandTimeout = options.commandTimeoutMs ?? 120_000
  assert.ok(budget > 0 && budget <= 300_000 && Number.isInteger(maxAttempts) && maxAttempts > 0 && maxAttempts <= 6 && commandTimeout > 0 && commandTimeout <= 120_000)
  const started = now()
  let virtualWait = 0
  let delay = 2_000
  let lastFailure
  const remaining = () => Math.max(0, budget - (now() - started + virtualWait))
  const evidence = { status: 'installing', buildId: report.buildId, commit: report.commit, attempts: [] }
  const save = async (status) => {
    evidence.status = status
    evidence.elapsedMs = now() - started + virtualWait
    await mkdir(path.dirname(evidenceFile), { recursive: true })
    await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`)
  }
  for (let attempt = 1; attempt <= maxAttempts && remaining() >= 1; attempt++) {
    const state = await mkdtemp(path.join(directory, '.pnpm-install-'))
    await Promise.all(['user.npmrc', 'global.npmrc'].map(name => writeFile(path.join(state, name), '')))
    const timeout = Math.floor(Math.min(commandTimeout, remaining()))
    if (timeout < 1) {
      break
    }
    const entry = { attempt, state, timeoutMs: timeout }
    evidence.attempts.push(entry)
    let result
    try {
      result = await run([
        '--config.pm-on-fail=ignore',
        '--config.runtime-on-fail=ignore',
        '--config.manage-package-manager-versions=false',
        '--config.ignore-pnpmfile=true',
        'install',
        '--ignore-scripts',
        '--no-frozen-lockfile',
        '--no-prefer-frozen-lockfile',
        '--no-prefer-offline',
        '--no-offline',
        '--registry=https://registry.npmjs.org/',
        '--reporter=ndjson',
        `--store-dir=${path.join(state, 'store')}`,
        `--state-dir=${path.join(state, 'state')}`,
        `--config.cache-dir=${path.join(state, 'cache')}`,
      ], {
        cwd: directory,
        env: installationEnvironment(process.env, state),
        extendEnv: false,
        reject: false,
        timeout,
        forceKillAfterDelay: 1_000,
        maxBuffer: 4 * 1024 * 1024,
      })
      Object.assign(entry, diagnostics(result))
    }
    catch (error) {
      Object.assign(entry, diagnostics(error), { error: String(error) })
      await save('failed')
      throw error
    }
    if (result?.exitCode === 0 && !result.failed && result.cause === undefined && result.code === undefined
      && !result.timedOut && !result.signal && !result.isCanceled && !result.isTerminated && !result.isMaxBuffer && !result.isForcefullyTerminated) {
      await save('installed')
      return
    }
    lastFailure = new Error(`Nightly pnpm installation failed on attempt ${attempt}; see ${evidenceFile}`)
    entry.retryable = missingBatchVersion(result, expected)
    if (!entry.retryable) {
      await save('failed')
      throw lastFailure
    }
    await save('waiting-for-visibility')
    if (attempt === maxAttempts || remaining() <= delay) {
      break
    }
    // 清理范围仅限本消费者创建的部分安装与本轮缓存，保留终止失败的现场。
    await Promise.all(['node_modules', 'pnpm-lock.yaml', path.basename(state)].map(name => rm(path.join(directory, name), { recursive: true, force: true })))
    const before = now()
    await sleep(delay)
    virtualWait += Math.max(0, delay - (now() - before))
    delay = Math.min(delay * 2, 30_000)
  }
  await save('visibility-exhausted')
  throw new Error(`Nightly installation visibility budget exhausted; see ${evidenceFile}`, { cause: lastFailure })
}
