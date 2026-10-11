import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { repositoryPackageManager } from '../version-contract.mjs'
import { authoredCss } from './authored.mjs'
import { openBrowser } from './browser.mjs'
import { cases, checkCatalog, commands, coverage, isWeb, matrix, repo } from './catalog.mjs'
import { developmentUrl } from './endpoint.mjs'
import { inspectNative } from './native.mjs'
import { inspectFiles } from './output.mjs'
import { insertProbe } from './probe.mjs'
import { assertGulpWatchBuildComplete, assertMpxWatchBuildComplete, assertTaroWatchBuildComplete, assertUniWatchBuildComplete, assertWeappViteWatchReady, complete, developmentEnvironment, freePort, start, until } from './process.mjs'
import { snapshotOutput } from './snapshot.mjs'
import { replaceSourceFile } from './source-file.mjs'

const args = process.argv.slice(2)
checkCatalog()
if (args.includes('--matrix')) {
  console.log(JSON.stringify(matrix()))
  process.exit(0)
}
const selectedIds = process.env.DEMO_MATRIX_CASES ? JSON.parse(process.env.DEMO_MATRIX_CASES) : args.filter(arg => !arg.startsWith('--'))
const selected = selectedIds.length
  ? selectedIds.map((id) => {
      const item = cases.find(item => item.id === id)
      assert.ok(item, `Unknown case ${id}`)
      return item
    })
  : cases
assert.ok(selected.length)
assert.equal(new Set(selected.map(item => item.id)).size, selected.length)
const update = args.includes('--update')
const buildOnly = args.includes('--build-only')
assert.ok(!update || !process.env.GITHUB_ACTIONS, 'CI cannot update baselines')
assert.ok(!buildOnly || !process.env.GITHUB_ACTIONS, 'CI must execute every phase')
const artifactRoot = process.env.DEMO_MATRIX_ARTIFACT_DIR ? path.resolve(process.env.DEMO_MATRIX_ARTIFACT_DIR) : path.join(repo, 'e2e/.artifacts/demo-matrix')
const baselineRoot = path.join(repo, 'e2e/__snapshots__/demo-matrix')
const report = {
  sha: (await execa('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout,
  os: process.platform,
  node: process.version,
  pnpm: (await execa('pnpm', ['--version'], { cwd: repo })).stdout,
  expected: selected.map(item => item.id),
  results: [],
}
assert.equal(report.pnpm, repositoryPackageManager.version)
await mkdir(artifactRoot, { recursive: true })
let interrupted = false
let activeSession
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true
    void activeSession?.stop()
  })
}

async function runCase(item) {
  const dir = path.join(repo, 'demo', item.name)
  const sourceFile = path.join(dir, item.source)
  const original = await readFile(sourceFile, 'utf8')
  const authoredFile = coverage(item) === 'authored-styles' ? path.join(dir, 'src/sub-normal/index.css') : undefined
  const originalAuthored = authoredFile
    ? await readFile(authoredFile, 'utf8').catch((error) => {
        if (error.code !== 'ENOENT') {
          throw error
        }
      })
    : undefined
  const slug = item.id.replaceAll('/', '-').replaceAll(':', '-')
  const artifactDir = path.join(artifactRoot, slug)
  const baselineFile = path.join(baselineRoot, `${slug}.json`)
  const command = commands(item)
  const outputDir = path.join(dir, command.output)
  const result = { id: item.id, coverage: coverage(item), commands: command, status: 'running', rounds: {} }
  let session
  let browser
  await mkdir(artifactDir, { recursive: true })
  try {
    if (authoredFile) {
      await replaceSourceFile(authoredFile, `${originalAuthored ?? ''}\n${authoredCss(item, 'initial')}`)
    }
    await replaceSourceFile(sourceFile, await insertProbe(original, item, 'initial'))
    await rm(outputDir, { recursive: true, force: true })
    session = start(command.build, dir, { ...command.env, NODE_ENV: 'production', BROWSERSLIST_ENV: 'production' }, path.join(artifactDir, 'build-live.log'))
    activeSession = session
    try {
      await complete(session)
    }
    finally { await writeFile(path.join(artifactDir, 'build.log'), session.log()) }
    assert.ok(!interrupted, 'Matrix interrupted')
    await cp(outputDir, path.join(artifactDir, 'production'), { recursive: true })
    const production = result.coverage === 'native-build'
      ? await inspectNative(outputDir)
      : await inspectFiles(outputDir, item, 'initial')
    result.rounds.production = production
    if (update) {
      await mkdir(baselineRoot, { recursive: true })
      await writeFile(baselineFile, `${JSON.stringify(production, null, 2)}\n`)
    }
    else {
      assert.deepEqual(production, JSON.parse(await readFile(baselineFile, 'utf8')), `Static baseline: ${item.id}`)
    }
    await session.stop()
    if (['native-build', 'webview-build'].includes(result.coverage)) {
      result.status = 'passed'
      result.limitation = result.coverage === 'native-build'
        ? '仅验收现有原生 CLI 构建、应用注册和页面探针产物；不提供 utility 样式覆盖或设备运行证据。'
        : '验收 WebView CLI 构建与 utility 产物；原生桥接及设备运行不在当前矩阵范围内。'
      return result
    }
    if (buildOnly) {
      result.status = 'build-only'
      return result
    }
    await rm(outputDir, { recursive: true, force: true })
    const port = await freePort(item.family === 'taro' ? '0.0.0.0' : '127.0.0.1')
    command.dev = commands(item, port).dev
    session = start(command.dev, dir, developmentEnvironment({ ...command.env, DEMO_MATRIX_NATIVE_WATCH_FILE: process.env.DEMO_MATRIX_PROCESS_DIAGNOSTICS === '1' ? sourceFile : '' }), path.join(artifactDir, 'dev-live.log'))
    activeSession = session
    if (isWeb(item) || item.name.startsWith('web/')) {
      result.endpoint = { requestedPort: port, url: await developmentUrl(item, port, session) }
      browser = await openBrowser(result.endpoint.url, session, artifactDir)
    }
    for (const round of ['initial', 'replace', 'add', 'restore']) {
      assert.ok(!interrupted, 'Matrix interrupted')
      console.log(`[demo-matrix] ${new Date().toISOString()} ${item.id} begin ${round}`)
      const buildLogOffset = round === 'initial' ? 0 : session.log().length
      if (round !== 'initial') {
        // DOM 已可见不代表上一轮 HMR 已完成，先等待运行时回到 idle 再触发新修改。
        await browser?.waitForUpdateIdle()
        if (authoredFile) {
          await replaceSourceFile(authoredFile, `${originalAuthored ?? ''}\n${authoredCss(item, round)}`)
        }
        await replaceSourceFile(sourceFile, await insertProbe(original, item, round))
      }
      result.rounds[round] = await until(async () => {
        if (browser) {
          return browser.inspect(item, round)
        }
        if (item.family === 'taro') {
          assertTaroWatchBuildComplete(session.log(), buildLogOffset)
        }
        else if (item.family === 'uni') {
          assertUniWatchBuildComplete(session.log(), buildLogOffset)
        }
        else if (item.family === 'gulp') {
          assertGulpWatchBuildComplete(session.log(), buildLogOffset)
        }
        else if (item.family === 'mpx') {
          assertMpxWatchBuildComplete(session.log(), buildLogOffset)
        }
        else if (item.family === 'weapp-vite' && round === 'initial') {
          // 首轮文件可在监听初始化前写出，必须等待服务就绪后才能开始修改。
          assertWeappViteWatchReady(session.log())
        }
        const snapshotDir = path.join(artifactDir, round)
        // 构建器可能在下一轮清理产物；检查归档副本，避免结果与证据分属不同轮次。
        await rm(snapshotDir, { recursive: true, force: true })
        await snapshotOutput(outputDir, snapshotDir)
        return inspectFiles(snapshotDir, item, round)
      }, session)
      console.log(`[demo-matrix] ${new Date().toISOString()} ${item.id} verified ${round}`)
      if (browser) {
        await browser.screenshot(round)
      }
    }
    if (browser) {
      await browser.reload()
      result.rounds.refresh = await until(() => browser.inspect(item, 'restore'), session)
    }
    result.status = 'passed'
  }
  catch (error) {
    result.status = 'failed'
    result.error = error.stack
    await browser?.screenshot('failure').catch(() => {})
  }
  finally {
    if (browser) {
      await writeFile(path.join(artifactDir, 'browser-errors.json'), JSON.stringify(browser.events, null, 2))
      await browser.close()
    }
    if (session) {
      await writeFile(path.join(artifactDir, 'session.log'), session.log())
      await session.stop()
    }
    await replaceSourceFile(sourceFile, original)
    if (authoredFile) {
      if (originalAuthored === undefined) {
        await rm(authoredFile, { force: true })
      }
      else { await replaceSourceFile(authoredFile, originalAuthored) }
    }
    activeSession = undefined
    await writeFile(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2))
  }
  return result
}

for (const item of selected) {
  if (interrupted) {
    break
  }
  console.log(`Starting ${item.id}`)
  const result = await runCase(item)
  report.results.push(result)
  await writeFile(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`${result.status}: ${item.id}${result.error ? `\n${result.error}` : ''}`)
}
assert.equal(report.results.length, report.expected.length)
assert.ok(report.results.every(result => result.status === 'passed' || (buildOnly && result.status === 'build-only')), 'Demo matrix has failures; see artifacts')
