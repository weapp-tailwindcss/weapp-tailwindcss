import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parsePosixProcessRows, selectProcessTreeRows } from '../../process-memory.mjs'
import { sha256 } from './identity.mjs'
import { readGcEvidence } from './gc-evidence.mjs'
import { projectRelative } from './lock-axis.mjs'
import { failureEvidence, processOwnership, runOwned } from './owned-process.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const gcPreload = path.join(here, 'gc-preload.mjs')
const gcPaths = path.resolve(here, '../../gc-paths.mjs')

export function sampleRss(pid, deadline, execute = spawnSync, now = Date.now) {
  const budget = deadline - now()
  assert.ok(budget > 0, 'RSS 采样已耗尽构建截止，禁止新建探针')
  const result = execute('ps', ['-Ao', 'pid=,ppid=,rss=,comm='], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: Math.min(3000, budget), env: { ...process.env, LC_ALL: 'C' },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `RSS 探针失败：${result.stderr}`)
  assert.ok(now() < deadline, 'RSS 采样结果超过构建截止')
  const rows = selectProcessTreeRows(parsePosixProcessRows(result.stdout), pid)
  if (!rows.length) return undefined
  return {
    at: now(), rssMb: rows.reduce((total, row) => total + row.rssKb, 0) / 1024,
    processCount: rows.length,
    processes: rows.map(({ pid, ppid, rssKb, command }) => ({ pid, ppid, rssMb: rssKb / 1024, command })),
  }
}

export function validatePhases(records) {
  assert.equal(records[0]?.type, 'start', '缺少编译器 preload 身份')
  assert.equal(records.at(-1)?.type, 'exit', '缺少正常退出观测')
  assert.equal(records.at(-1).exitCode, 0)
  const options = records.filter(item => item.type === 'compiler-options')
  assert.ok(options.some(item => !item.child), '没有真实主编译器')
  for (const { options: actual, child } of options) {
    if (child) continue
    assert.equal(actual.mode, 'production')
    assert.equal(actual.cache, false)
    assert.equal(actual.optimization.minimize, true)
    assert.ok(actual.resolve.mainFields.includes('main:mini'))
    assert.deepEqual(actual.optimization.minimizer.map(item => item._constructor).sort(), ['CssMinimizerPlugin', 'TerserPlugin'])
    assert.ok(actual.optimization.minimizer.every(item => item.options.parallel === true))
  }
  for (const item of options) {
    const phases = records.filter(record => record.type === 'phase' && record.number === item.number)
    assert.deepEqual(phases.map(record => record.phase), ['before-optimize-size', 'after-optimize-size', 'after-process-assets'])
    for (const phase of phases) {
      assert.equal(phase.manifest.length, phase.assetCount)
      assert.ok(phase.manifest.every(asset => /^[a-f\d]{64}$/.test(asset.sha256) && asset.bytes >= 0))
    }
  }
  return options
}

export async function outputManifest(directory) {
  const files = []
  async function visit(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) {
        const contents = await fsp.readFile(file)
        files.push({ name: path.relative(directory, file), bytes: contents.length, sha256: sha256(contents) })
      }
      else throw new Error(`构建输出包含意外类型：${file}`)
    }
  }
  await visit(directory)
  return files.sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

function readRecords(file) {
  const content = fs.readFileSync(file, 'utf8')
  assert.ok(content.endsWith('\n'), `观测记录不完整：${file}`)
  return content.trimEnd().split('\n').map(line => JSON.parse(line))
}

export async function measure(root, role, run, outDir) {
  const project = path.join(root, projectRelative)
  const directory = path.join(outDir, role, `run-${run}`)
  await fsp.mkdir(directory)
  // 每轮都使用新进程；持久化缓存与 prebundle 在原 demo 配置中已经关闭。
  for (const name of ['dist', '.taro', '.swc', path.join('node_modules', '.cache')]) {
    await fsp.rm(path.join(project, name), { recursive: true, force: true })
  }
  const entry = path.join(root, 'scripts/taro-build-runner.mjs')
  const phaseFile = path.join(directory, 'compiler.ndjson')
  const session = { root, project, expectedEntry: entry, file: phaseFile, role, run }
  const gcIdentity = {
    role, run, kind: 'build', project: 'demo-taro-webpack-react-tailwindcss-v4__mp-weixin',
    sessionDirectory: directory,
    expectedPreloadSha256: sha256(fs.readFileSync(gcPreload)),
    expectedPathHelperSha256: sha256(fs.readFileSync(gcPaths)),
  }
  const started = Date.now()
  const deadline = started + 300000
  const log = fs.createWriteStream(path.join(directory, 'build.log'), { flags: 'wx' })
  let logError
  log.on('error', error => { logError = error })
  let child
  const samples = []
  const probeFailures = []
  const sample = () => {
    if (!child?.pid) return
    try {
      const value = sampleRss(child.pid, deadline)
      if (value) samples.push(value)
      else {
        try { process.kill(child.pid, 0); probeFailures.push({ at: Date.now(), error: '存活进程无样本' }) }
        catch (error) { if (error.code !== 'ESRCH') throw error }
      }
    }
    catch (error) { probeFailures.push({ at: Date.now(), error: String(error) }) }
  }
  let sampler
  let outcome
  let primary
  const cleanupErrors = []
  try {
    outcome = await runOwned(process.execPath, ['--require', path.join(here, 'preload.cjs'), '--import', gcPreload, entry, 'build', '--type', 'weapp'], {
      cwd: project, stdio: ['ignore', 'pipe', 'pipe'], timeoutMs: 300000,
      env: {
        ...process.env, CI: '1', NODE_ENV: 'production', BROWSERSLIST_ENV: 'production',
        TARO_BUILD_STRICT: '1', LEFTHOOK: '0', HUSKY: '0',
        WEAPP_TW_HMR_TIMING: '1', WEAPP_TW_HMR_TIMING_LOG: '0',
        WEAPP_TW_COMPILER_AB_SESSION: JSON.stringify(session),
        WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: entry, WEAPP_TW_BENCH_GC_SESSION: JSON.stringify(gcIdentity),
      },
      onSpawn(ownedChild) {
        child = ownedChild
        child.stdout.pipe(log, { end: false })
        child.stderr.pipe(log, { end: false })
        sample()
        sampler = setInterval(sample, 250)
        child.once('close', () => clearInterval(sampler))
      },
    })
  }
  catch (error) { primary = error }
  finally {
    clearInterval(sampler)
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { log.destroy(); reject(new Error('构建日志 flush 超过 3000ms 截止')) }, 3000)
        log.once('error', (error) => { clearTimeout(timer); reject(error) })
        log.end(() => { clearTimeout(timer); logError ? reject(logError) : resolve() })
      })
    }
    catch (error) { cleanupErrors.push(error) }
    try {
      await fsp.writeFile(path.join(directory, 'rss.json'), `${JSON.stringify({ rootPid: child?.pid, outcome, primaryError: primary && failureEvidence(primary), cleanupErrors: cleanupErrors.map(failureEvidence), samples, probeFailures, processes: processOwnership() }, null, 2)}\n`)
    }
    catch (error) { cleanupErrors.push(error) }
  }
  if (primary || cleanupErrors.length) throw new AggregateError([...(primary ? [primary] : []), ...cleanupErrors], `冷构建失败：${role}/${run}`, { cause: primary })
  assert.equal(probeFailures.length, 0, '存活进程的 RSS 采样失败')
  assert.ok(samples.length > 0 && samples.some(item => item.processes.some(row => row.pid === child.pid)), '缺少主 Node 的 RSS 证据')
  const phases = readRecords(phaseFile)
  validatePhases(phases)
  assert.equal(phases[0].pid, child.pid)
  const gcFile = path.join(directory, `gc-${child.pid}.ndjson`)
  let gcEvidence
  try {
    gcEvidence = readGcEvidence(gcFile, { pid: child.pid, identity: gcIdentity, actualEntry: fs.realpathSync(entry), stderr: fs.readFileSync(path.join(directory, 'build.log'), 'utf8') })
  }
  catch (error) {
    await fsp.writeFile(path.join(directory, 'gc-evidence.json'), `${JSON.stringify({ available: false, error: failureEvidence(error), pid: child.pid, identity: gcIdentity }, null, 2)}\n`)
    throw error
  }
  await fsp.writeFile(path.join(directory, 'gc-evidence.json'), `${JSON.stringify(gcEvidence, null, 2)}\n`)
  const output = await outputManifest(path.join(project, 'dist'))
  assert.ok(output.some(file => file.name === 'app.js') && output.some(file => file.name === 'app.json'), '没有完整微信构建产物')
  await fsp.writeFile(path.join(directory, 'output.json'), `${JSON.stringify(output, null, 2)}\n`)
  const result = {
    role, run, pid: child.pid, durationMs: Date.now() - started,
    mainNodePeakRssMb: Math.max(...samples.flatMap(item => item.processes.filter(row => row.pid === child.pid).map(row => row.rssMb))),
    treePeakRssMb: Math.max(...samples.map(item => item.rssMb)),
    observerPeakRssMb: Math.max(...phases.filter(item => item.memory).map(item => item.memory.rss / 1024 / 1024)),
    workers: phases.at(-1).workers, phases: phases.filter(item => item.type === 'phase'),
    options: phases.filter(item => item.type === 'compiler-options'),
    naturalGcEvents: gcEvidence.events,
    outputFiles: output.length, outputBytes: output.reduce((sum, file) => sum + file.bytes, 0),
  }
  await fsp.writeFile(path.join(directory, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
