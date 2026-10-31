import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createSavePacer } from '../../performance/demo/save-pacing.mjs'
import { validateAllocationRequest } from './diagnostics/constants.mjs'
import { createCaseDiagnostics } from './diagnostics/controller.mjs'
import { runWithCleanup } from './diagnostics/failures.mjs'
import { createProcessMemorySampler } from './process-memory.mjs'
import { selectBenchmarkProjects } from './project-selection.mjs'
import { benchmarkProjects as projects } from './projects.mjs'
import { resolvePluginTimingSample } from './timing.mjs'
import { createWatchLogBuffer } from './watch-log-buffer.mjs'
import { assertWatchRunning, stopChild } from './watch-process.mjs'
import { isWatchBuildComplete, isWatchReady } from './watch-readiness.mjs'

const defaultVersions = [
  { version: '4.9.8', root: '/tmp/weapp-tailwindcss-4.9.8' },
  { version: '4.10.2', root: '/tmp/weapp-tailwindcss-4.10.2' },
]

function parseNumber(flag, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) {
    return fallback
  }
  const raw = process.argv[idx + 1]
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseString(flag, fallback) {
  const idx = process.argv.indexOf(flag)
  if (idx === -1) {
    return fallback
  }
  return process.argv[idx + 1] ?? fallback
}

async function parseVersions() {
  const versionsFile = parseString('--versions-file', '')
  if (!versionsFile) {
    return defaultVersions
  }

  const versions = JSON.parse(await fs.readFile(path.resolve(versionsFile), 'utf8'))
  if (!Array.isArray(versions) || versions.length < 2) {
    throw new TypeError('--versions-file must contain at least two version roots')
  }

  return versions.map((item) => {
    if (typeof item?.version !== 'string' || typeof item?.root !== 'string') {
      throw new TypeError('--versions-file entries must include string version and root')
    }
    return {
      version: item.version,
      root: path.resolve(item.root),
      ...(item.diagnosticIdentity ? { diagnosticIdentity: item.diagnosticIdentity } : {}),
    }
  })
}

function now() {
  return performance.now()
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function stddev(values) {
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + ((v - m) ** 2), 0) / values.length)
}

function summarize(values) {
  if (values.length === 0) {
    return undefined
  }
  const sorted = [...values].sort((a, b) => a - b)
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  const p99Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[p95Index],
    p99: sorted[p99Index],
    stddev: stddev(values),
  }
}

function summarizeSteady(values) {
  return summarize(values.slice(1)) ?? summarize(values)
}

function summarizeTimingPhases(timings) {
  const phases = new Map()
  for (const timing of timings) {
    const phase = timing?.phase
    const durationMs = timing?.durationMs
    if (typeof phase !== 'string' || typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
      continue
    }
    const values = phases.get(phase) ?? []
    values.push(durationMs)
    phases.set(phase, values)
  }
  return Object.fromEntries([...phases].map(([phase, values]) => [phase, summarize(values)]))
}

function spawnPnpmWithEnv(cwd, args, env = {}, stdio = 'pipe') {
  return spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
    cwd,
    stdio,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  })
}

const localUrlRE = /(?:Local|Loopback|Listening at):\s*(https?:\/\/\S+)/i

async function readText(file) {
  try {
    return await fs.readFile(file, 'utf8')
  }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EBUSY') {
      return undefined
    }
    throw error
  }
}

async function exists(file) {
  try {
    await fs.access(file)
    return true
  }
  catch {
    return false
  }
}

async function statMtimeMs(file) {
  try {
    return (await fs.stat(file)).mtimeMs
  }
  catch {
    return 0
  }
}

async function waitFor(check, timeoutMs, intervalMs = 120) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return false
}

async function waitForPluginTimingSample(logs, startIndex, timeoutMs, intervalMs) {
  let sample
  await waitFor(() => {
    sample = resolvePluginTimingSample(logs.slice(startIndex))
    return sample !== undefined
  }, Math.min(timeoutMs, 5000), Math.min(intervalMs, 50))
  return sample
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('unable to resolve free port')))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

function appendQuery(url, key, value) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function resolveDevServerCommand(projectMeta, port) {
  if (Array.isArray(projectMeta.devServerCommand) && projectMeta.devServerCommand.length > 0) {
    return projectMeta.devServerCommand.map(item => String(item).replaceAll('{port}', String(port)))
  }

  if (projectMeta.devScript === 'dev:h5') {
    return ['exec', 'uni', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  }

  if (projectMeta.devScript === 'dev') {
    return ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  }

  return ['run', projectMeta.devScript]
}

function resolveServerProbeUrls(projectMeta, baseUrl, marker) {
  const base = trimTrailingSlash(baseUrl)
  if (Array.isArray(projectMeta.serverProbePaths) && projectMeta.serverProbePaths.length > 0) {
    return projectMeta.serverProbePaths.map(item => appendQuery(`${base}${item}`, 'twbench', marker))
  }
  const modulePath = projectMeta.serverModulePath ?? `/${projectMeta.sourceFile}`
  return [appendQuery(`${base}${modulePath}`, 'twbench', marker)]
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return await response.text()
}

function resolveLoggedBaseUrls(logs, fallbackUrl) {
  const urls = new Set([fallbackUrl])
  for (const line of logs) {
    const matched = line.match(localUrlRE)?.[1]
    if (matched) {
      urls.add(matched)
    }
  }
  return Array.from(urls)
}

async function fetchProbeText(url) {
  const html = await fetchText(url)
  const assetUrls = []
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const assetPath = match[1]
    if (!assetPath || assetPath.startsWith('http') || assetPath.startsWith('//') || assetPath.startsWith('data:')) {
      continue
    }
    assetUrls.push(new URL(assetPath, url).toString())
  }

  const assetTexts = []
  for (const assetUrl of assetUrls) {
    try {
      assetTexts.push(await fetchText(appendQuery(assetUrl, 'twbench_asset', Date.now())))
    }
    catch {
    }
  }
  return `${html}\n${assetTexts.join('\n')}`
}

async function runBuildOnce(cwd, buildScript, timeoutMs, buildEnv = {}, diagnostics) {
  const start = now()
  const child = spawnPnpmWithEnv(cwd, ['run', buildScript], {
    WEAPP_TW_HMR_TIMING: '1',
    WEAPP_TW_HMR_TIMING_LOG: '0',
    ...buildEnv,
    ...diagnostics?.env,
  }, 'pipe')
  diagnostics?.spawned(child.pid, child)
  const memorySampler = createProcessMemorySampler(child.pid)
  let logs = ''
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString('utf8')
  })

  let code
  let memory
  await runWithCleanup(async () => {
    code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          if (child.pid && process.platform !== 'win32') {
            process.kill(-child.pid, 'SIGKILL')
          }
          else {
            child.kill('SIGKILL')
          }
        }
        catch {}
        reject(new Error(`build timeout ${timeoutMs}ms`))
      }, timeoutMs)

      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (exitCode) => {
        clearTimeout(timer)
        resolve(exitCode ?? 1)
      })
    })
  }, [
    () => { memory = memorySampler.stop() },
    () => code === undefined ? stopChild(child) : undefined,
  ])

  if (code !== 0) {
    throw new Error(`build failed code=${code}\n${logs.slice(-4000)}`)
  }
  if (logs.includes('[uni-build-guard]') && logs.includes('已跳过 uni-app 的真实构建')) {
    throw new Error(`build skipped by uni-build-guard; set project buildEnv.UNI_BUILD_STRICT=1 for benchmark builds\n${logs.slice(-4000)}`)
  }
  if (logs.includes('[taro-build-guard]') && logs.includes('已跳过 Taro demo/app 的 weapp 构建')) {
    throw new Error(`build skipped by taro-build-guard; set project buildEnv.TARO_BUILD_STRICT=1 for benchmark builds\n${logs.slice(-4000)}`)
  }

  const pluginTiming = resolvePluginTimingSample(logs.split(/\r?\n/))
  return {
    rootPid: child.pid,
    durationMs: now() - start,
    pluginProcessMs: pluginTiming?.durationMs,
    pluginTiming,
    memory,
  }
}

function injectContent(original, marker, injectType) {
  if (injectType === 'vue') {
    const next = original.replace('</template>', `\n  <view data-tw-bench="${marker}" class="bg-[#123456]">bench</view>\n</template>`)
    if (next === original) {
      throw new Error('inject failed: </template> not found')
    }
    return next
  }

  if (injectType === 'jsx') {
    const next = original.replace(/className=(['"])(.*?)\1/, (full, quote, classes) => {
      return `data-tw-bench=${quote}${marker}${quote} ${full.replace(classes, `${classes} bg-[#123456]`)}`
    })
    if (next === original) {
      throw new Error('inject failed: className="..." or className=\'...\' not found')
    }
    return next
  }

  const replaced = original.replace(/class="([^"]*)"/, (_full, classes) => {
    return `data-tw-bench="${marker}" class="${classes} bg-[#123456]"`
  })
  if (replaced === original) {
    return `${original}\n<view data-tw-bench="${marker}" class="bg-[#123456]">bench</view>\n`
  }
  return replaced
}

async function runHmrRounds({
  cwd,
  sourceFile,
  outputTemplate,
  outputProbeTemplates = [],
  devScript,
  injectType,
  devEnv,
  watchReadyLog,
  watchBuildLogs,
  watchSettleMs,
  rounds,
  timeoutMs,
  pollIntervalMs,
  diagnostics,
}) {
  const sourcePath = path.join(cwd, sourceFile)
  const outputPath = path.join(cwd, outputTemplate)
  const probePaths = [outputPath, ...outputProbeTemplates.map(item => path.join(cwd, item))]
  const original = await fs.readFile(sourcePath, 'utf8')
  const initialOutputMtime = await statMtimeMs(outputPath)
  let sourceDirty = false

  const child = spawnPnpmWithEnv(cwd, ['run', devScript], {
    WEAPP_TW_HMR_TIMING: '1',
    WEAPP_TW_HMR_TIMING_LOG: '0',
    ...devEnv,
    ...diagnostics?.env,
  }, 'pipe')
  diagnostics?.spawned(child.pid, child)
  const memorySampler = createProcessMemorySampler(child.pid)
  const logBuffer = createWatchLogBuffer()
  const logs = logBuffer.lines
  child.stdout.on('data', buf => logBuffer.collect(buf, 'stdout'))
  child.stderr.on('data', buf => logBuffer.collect(buf, 'stderr'))

  return runWithCleanup(async () => {
    const ready = await waitFor(async () => {
      assertWatchRunning(child, 'dev exited early', logs)
      const texts = await Promise.all(probePaths.map(readText))
      const outputHasContent = texts.every(text => typeof text === 'string' && text.trim().length > 0)
      return isWatchReady({
        logs,
        outputExists: await exists(outputPath),
        outputMtime: await statMtimeMs(outputPath),
        initialOutputMtime,
        outputHasContent,
        watchReadyLog,
      })
    }, timeoutMs, pollIntervalMs)

    assertWatchRunning(child, 'dev exited early', logs)
    if (!ready) {
      throw new Error(`dev warmup timeout ${timeoutMs}ms\n${logs.slice(-120).join('\n')}`)
    }
    diagnostics?.mark('watch-ready')

    const times = []
    const savePacer = createSavePacer(watchSettleMs)

    for (let i = 0; i < rounds; i += 1) {
      const marker = diagnostics?.mutationMarker?.(i + 1, original) ?? `twbench${Date.now()}${i}`
      const next = injectContent(original, marker, injectType)
      await savePacer.beforeSave()
      assertWatchRunning(child, `dev exited during hmr round=${i + 1}`, logs)
      const roundLogs = logBuffer.beginRound()
      const start = now()
      diagnostics?.mark('mutation-write', i + 1)
      sourceDirty = true
      await fs.writeFile(sourcePath, next, 'utf8')
      if (diagnostics?.source) {
        await diagnostics.source('mutation-written', sourcePath, next, marker)
      }

      const ok = await waitFor(async () => {
        assertWatchRunning(child, `dev exited during hmr round=${i + 1}`, logs)
        for (const probePath of probePaths) {
          const text = await readText(probePath)
          if (text?.includes(marker)) {
            return true
          }
        }
        return false
      }, timeoutMs, pollIntervalMs)

      assertWatchRunning(child, `dev exited during hmr round=${i + 1}`, logs)
      if (!ok) {
        throw new Error(`hmr round ${i + 1} timeout ${timeoutMs}ms marker=${marker}\n${logs.slice(-120).join('\n')}`)
      }
      diagnostics?.mark('mutation-observed', i + 1)

      const pluginTiming = await waitForPluginTimingSample(roundLogs.lines, 0, timeoutMs, pollIntervalMs)
      assertWatchRunning(child, `dev exited during hmr round=${i + 1}`, logs)
      times.push({
        durationMs: now() - start,
        pluginProcessMs: pluginTiming?.durationMs,
        pluginTiming,
      })

      // 保留 marker/timing 的原计时边界，但下一次写入必须等本轮产物提交。
      if (watchBuildLogs) {
        const committed = await waitFor(() => {
          assertWatchRunning(child, `dev exited before hmr commit round=${i + 1}`, logs)
          return isWatchBuildComplete(roundLogs.stdoutLines, watchBuildLogs)
        }, Math.max(0, timeoutMs - (now() - start)), pollIntervalMs)
        assertWatchRunning(child, `dev exited before hmr commit round=${i + 1}`, logs)
        if (!committed) {
          throw new Error(`hmr commit ${i + 1} timeout ${timeoutMs}ms\n${logs.slice(-120).join('\n')}`)
        }
      }
      roundLogs.close()
      savePacer.settled()
      await savePacer.beforeSave()
      assertWatchRunning(child, watchBuildLogs ? `dev exited before rollback commit round=${i + 1}` : `dev exited during hmr rollback round=${i + 1}`, logs)
      const rollbackLogs = logBuffer.beginRound()
      const rollbackStart = now()
      diagnostics?.mark('rollback-write', i + 1)
      await fs.writeFile(sourcePath, original, 'utf8')
      sourceDirty = false
      if (diagnostics?.source) {
        await diagnostics.source('rollback-written', sourcePath, original, marker)
      }
      const rolledBack = await waitFor(async () => {
        assertWatchRunning(child, watchBuildLogs ? `dev exited before rollback commit round=${i + 1}` : `dev exited during hmr rollback round=${i + 1}`, logs)
        for (const probePath of probePaths) {
          const text = await readText(probePath)
          // 文件观察和本轮生产者提交是独立条件，不能用任意一方替代另一方。
          if (!text?.trim() || text.includes(marker)) {
            return false
          }
        }
        return isWatchBuildComplete(rollbackLogs.stdoutLines, watchBuildLogs)
      }, Math.max(0, timeoutMs - (now() - rollbackStart)), pollIntervalMs)
      rollbackLogs.close()
      assertWatchRunning(child, watchBuildLogs ? `dev exited before rollback commit round=${i + 1}` : `dev exited during hmr rollback round=${i + 1}`, logs)
      if (!rolledBack) {
        throw new Error(`hmr rollback ${i + 1} timeout ${timeoutMs}ms marker=${marker}\n${logs.slice(-120).join('\n')}`)
      }
      diagnostics?.mark('rollback-observed', i + 1)
      savePacer.settled()
      if (diagnostics?.source) {
        await diagnostics.source('rollback-observed', sourcePath, original, marker)
      }
    }

    if (diagnostics?.beforeStop) {
      await diagnostics.beforeStop()
    }
    assertWatchRunning(child, 'dev exited during hmr shutdown', logs)
    return {
      samples: times,
      memory: memorySampler.stop(),
    }
  }, [
    () => memorySampler.stop(),
    () => stopChild(child),
    async () => {
      if (sourceDirty) {
        await fs.writeFile(sourcePath, original, 'utf8')
        if (diagnostics?.source) {
          await diagnostics.source('failure-restored', sourcePath, original)
        }
      }
    },
  ])
}

async function runDevServerHmrRounds({
  cwd,
  projectMeta,
  rounds,
  timeoutMs,
  pollIntervalMs,
}) {
  const sourcePath = path.join(cwd, projectMeta.sourceFile)
  const original = await fs.readFile(sourcePath, 'utf8')
  const port = await findFreePort()
  const child = spawnPnpmWithEnv(cwd, resolveDevServerCommand(projectMeta, port), {
    BROWSER: 'none',
    WEAPP_TW_HMR_TIMING: '1',
    WEAPP_TW_HMR_TIMING_LOG: '0',
    ...projectMeta.devEnv,
  }, 'pipe')
  const memorySampler = createProcessMemorySampler(child.pid)
  const logBuffer = createWatchLogBuffer()
  const logs = logBuffer.lines
  child.stdout.on('data', buf => logBuffer.collect(buf, 'stdout'))
  child.stderr.on('data', buf => logBuffer.collect(buf, 'stderr'))

  try {
    let baseUrl = `http://127.0.0.1:${port}/`
    const ready = await waitFor(async () => {
      assertWatchRunning(child, 'dev server exited early', logs)
      for (const candidate of resolveLoggedBaseUrls(logs, `http://127.0.0.1:${port}/`)) {
        try {
          const text = await fetchText(candidate)
          if (text.trim().length > 0) {
            baseUrl = candidate
            return true
          }
        }
        catch {
        }
      }
      return false
    }, timeoutMs, pollIntervalMs)

    assertWatchRunning(child, 'dev server exited early', logs)
    if (!ready) {
      throw new Error(`dev server warmup timeout ${timeoutMs}ms\n${logs.slice(-120).join('\n')}`)
    }

    const times = []
    for (let i = 0; i < rounds; i += 1) {
      const marker = `twbench${Date.now()}${i}`
      const next = injectContent(original, marker, projectMeta.injectType)
      const probeUrls = resolveServerProbeUrls(projectMeta, baseUrl, marker)
      const roundLogs = logBuffer.beginRound()
      const start = now()
      await fs.writeFile(sourcePath, next, 'utf8')

      let lastError = ''
      const ok = await waitFor(async () => {
        assertWatchRunning(child, `dev server exited during hmr round=${i + 1}`, logs)
        for (const url of probeUrls) {
          try {
            const text = await fetchProbeText(url)
            if (text.includes(marker)) {
              return true
            }
            lastError = `${url} marker not found`
          }
          catch (error) {
            lastError = error instanceof Error ? `${url} ${error.message}` : `${url} ${String(error)}`
          }
        }
        return false
      }, timeoutMs, pollIntervalMs)

      assertWatchRunning(child, `dev server exited during hmr round=${i + 1}`, logs)
      if (!ok) {
        throw new Error(`dev server hmr round ${i + 1} timeout ${timeoutMs}ms marker=${marker}\n${lastError}\n${logs.slice(-120).join('\n')}`)
      }

      const pluginTiming = await waitForPluginTimingSample(roundLogs.lines, 0, timeoutMs, pollIntervalMs)
      assertWatchRunning(child, `dev server exited during hmr round=${i + 1}`, logs)
      times.push({
        durationMs: now() - start,
        pluginProcessMs: pluginTiming?.durationMs,
        pluginTiming,
      })

      await fs.writeFile(sourcePath, original, 'utf8')
      let rollbackError = ''
      const rolledBack = await waitFor(async () => {
        assertWatchRunning(child, `dev server exited during hmr rollback round=${i + 1}`, logs)
        let successfulProbe = false
        for (const url of probeUrls) {
          try {
            const text = await fetchProbeText(url)
            successfulProbe = true
            if (text.includes(marker)) {
              return false
            }
          }
          catch (error) {
            rollbackError = error instanceof Error ? `${url} ${error.message}` : `${url} ${String(error)}`
          }
        }
        return successfulProbe
      }, timeoutMs, pollIntervalMs)
      roundLogs.close()
      assertWatchRunning(child, `dev server exited during hmr rollback round=${i + 1}`, logs)
      if (!rolledBack) {
        throw new Error(`dev server hmr rollback ${i + 1} timeout ${timeoutMs}ms marker=${marker}\n${rollbackError}\n${logs.slice(-120).join('\n')}`)
      }
    }

    await fs.writeFile(sourcePath, original, 'utf8')
    assertWatchRunning(child, 'dev server exited during hmr shutdown', logs)
    return {
      samples: times,
      memory: memorySampler.stop(),
    }
  }
  finally {
    memorySampler.stop()
    await stopChild(child)
    await fs.writeFile(sourcePath, original, 'utf8')
  }
}

export async function runCase(versionMeta, projectMeta, options) {
  const cwd = path.join(versionMeta.root, projectMeta.project)
  const buildMs = []
  const buildPluginMs = []
  const buildPluginTimings = []
  const buildPeakRssMb = []
  const buildSteadyRssMb = []
  const buildMemorySamples = []

  const buildMode = projectMeta.buildMode ?? 'build'
  if (buildMode === 'unsupported') {
    process.stdout.write(`[${versionMeta.version}/${projectMeta.key}] build skipped: ${projectMeta.buildNote}\n`)
  }
  else {
    for (let i = 0; i < options.buildRuns; i += 1) {
      const diagnostics = await createCaseDiagnostics({ cwd, versionMeta, projectMeta, directory: options.gcDiagnosticDir, kind: 'build', run: i + 1, env: projectMeta.buildEnv, allocation: options.allocationDiagnostics ? 'allocation' : options.inputDiagnostics ? 'inputs' : undefined })
      const sample = await runWithCleanup(
        () => runBuildOnce(cwd, projectMeta.buildScript, options.timeoutMs, projectMeta.buildEnv, diagnostics),
        [outcome => diagnostics?.finish(outcome)],
      )
      buildMemorySamples.push({ run: i + 1, ...sample })
      buildMs.push(sample.durationMs)
      if (typeof sample.pluginProcessMs === 'number') {
        buildPluginMs.push(sample.pluginProcessMs)
      }
      if (sample.pluginTiming) {
        buildPluginTimings.push(sample.pluginTiming)
      }
      if (sample.memory.count > 0) {
        buildPeakRssMb.push(sample.memory.peakRssMb)
        buildSteadyRssMb.push(sample.memory.steadyRssMb)
      }
      const pluginSuffix = typeof sample.pluginProcessMs === 'number' ? ` plugin=${sample.pluginProcessMs.toFixed(2)}ms` : ''
      process.stdout.write(`[${versionMeta.version}/${projectMeta.key}] build ${i + 1}/${options.buildRuns}: ${sample.durationMs.toFixed(2)}ms${pluginSuffix}\n`)
    }
  }

  const hmrMode = projectMeta.hmrMode ?? 'watch'
  const hmrMs = []
  const hmrPluginMs = []
  const hmrPluginTimings = []
  let hmrMemory
  if (hmrMode === 'unsupported' || hmrMode === 'fallback-build') {
    process.stdout.write(`[${versionMeta.version}/${projectMeta.key}] hmr skipped: ${projectMeta.hmrNote}\n`)
  }
  else {
    if (projectMeta.hmrDriver === 'dev-server') {
      const result = await runDevServerHmrRounds({
        cwd,
        projectMeta,
        rounds: options.hmrRuns,
        timeoutMs: options.timeoutMs,
        pollIntervalMs: options.pollIntervalMs,
      })
      hmrMemory = result.memory
      hmrMs.push(...result.samples.map(sample => sample.durationMs))
      hmrPluginMs.push(...result.samples.flatMap(sample => typeof sample.pluginProcessMs === 'number' ? [sample.pluginProcessMs] : []))
      hmrPluginTimings.push(...result.samples.flatMap(sample => sample.pluginTiming ? [sample.pluginTiming] : []))
    }
    else {
      const diagnostics = await createCaseDiagnostics({ cwd, versionMeta, projectMeta, directory: options.gcDiagnosticDir, kind: 'hmr', run: 1, env: projectMeta.devEnv, allocation: options.allocationDiagnostics ? 'allocation' : options.inputDiagnostics ? 'inputs' : undefined })
      const result = await runWithCleanup(
        () => runHmrRounds({
          cwd,
          sourceFile: projectMeta.sourceFile,
          outputTemplate: projectMeta.outputTemplate,
          outputProbeTemplates: projectMeta.outputProbeTemplates,
          devScript: projectMeta.devScript,
          injectType: projectMeta.injectType,
          devEnv: projectMeta.devEnv,
          watchReadyLog: projectMeta.watchReadyLog,
          watchBuildLogs: projectMeta.watchBuildLogs,
          watchSettleMs: projectMeta.watchSettleMs,
          rounds: options.hmrRuns,
          timeoutMs: options.timeoutMs,
          pollIntervalMs: options.pollIntervalMs,
          diagnostics,
        }),
        [outcome => diagnostics?.finish(outcome)],
      )
      hmrMemory = result.memory
      hmrMs.push(...result.samples.map(sample => sample.durationMs))
      hmrPluginMs.push(...result.samples.flatMap(sample => typeof sample.pluginProcessMs === 'number' ? [sample.pluginProcessMs] : []))
      hmrPluginTimings.push(...result.samples.flatMap(sample => sample.pluginTiming ? [sample.pluginTiming] : []))
    }

    hmrMs.forEach((ms, idx) => {
      const pluginMs = hmrPluginMs[idx]
      const pluginSuffix = typeof pluginMs === 'number' ? ` plugin=${pluginMs.toFixed(2)}ms` : ''
      process.stdout.write(`[${versionMeta.version}/${projectMeta.key}] hmr ${idx + 1}/${options.hmrRuns} mode=${hmrMode}: ${ms.toFixed(2)}ms${pluginSuffix}\n`)
    })
  }

  return {
    version: versionMeta.version,
    root: versionMeta.root,
    ...projectMeta,
    buildMs,
    buildPluginMs,
    buildPluginTimings,
    buildPeakRssMb,
    buildSteadyRssMb,
    buildMemorySamples,
    hmrMs,
    hmrPluginMs,
    hmrPluginTimings,
    hmrMemory,
    buildMode,
    hmrMode,
    summary: {
      build: summarize(buildMs),
      hmr: summarize(hmrMs),
      buildSteady: summarizeSteady(buildMs),
      buildPlugin: summarize(buildPluginMs),
      buildPluginSteady: summarizeSteady(buildPluginMs),
      buildPeakRssMb: summarize(buildPeakRssMb),
      buildSteadyRssMb: summarize(buildSteadyRssMb),
      hmrSteady: summarizeSteady(hmrMs),
      hmrPlugin: summarize(hmrPluginMs),
      hmrPluginSteady: summarizeSteady(hmrPluginMs),
      hmrPeakRssMb: summarize(hmrMemory?.count > 0 ? [hmrMemory.peakRssMb] : []),
      hmrSteadyRssMb: summarize(hmrMemory?.count > 0 ? [hmrMemory.steadyRssMb] : []),
      phases: summarizeTimingPhases([...buildPluginTimings, ...hmrPluginTimings]),
    },
  }
}

async function main() {
  const only = process.argv.includes('--only') ? parseString('--only', '') : undefined
  const selectedProjects = selectBenchmarkProjects(only)
  const buildRuns = parseNumber('--build-runs', 3)
  const hmrRuns = parseNumber('--hmr-runs', 5)
  const timeoutMs = parseNumber('--timeout', 180000)
  const pollIntervalMs = parseNumber('--poll-interval', 30)
  const output = parseString('--out', 'benchmark/version-compare/data/matrix-raw.json')
  const gcDiagnosticDir = parseString('--gc-diagnostic-dir', '')
  const versions = await parseVersions()
  const allocationDiagnostics = process.argv.includes('--allocation-diagnostics')
  const inputDiagnostics = process.argv.includes('--input-diagnostics')
  if (allocationDiagnostics && inputDiagnostics) {
    throw new Error('输入证据与分配采样必须分开运行')
  }
  validateAllocationRequest({
    mode: inputDiagnostics ? 'inputs' : 'allocation',
    enabled: allocationDiagnostics || inputDiagnostics,
    guardMode: process.argv.includes('--guard'),
    baselineRef: versions.find(version => version.diagnosticIdentity?.role === 'base')?.diagnosticIdentity?.sourceCommit ?? '',
    selectedProjects,
    buildRuns,
    hmrRuns,
  })
  const options = { buildRuns, hmrRuns, timeoutMs, pollIntervalMs, ...(gcDiagnosticDir ? { gcDiagnosticDir: path.resolve(gcDiagnosticDir) } : {}), ...(allocationDiagnostics ? { allocationDiagnostics: true } : {}), ...(inputDiagnostics ? { inputDiagnostics: true } : {}) }
  const rows = []

  for (const projectMeta of selectedProjects) {
    for (const versionMeta of versions) {
      try {
        const row = await runCase(versionMeta, projectMeta, options)
        rows.push(row)
      }
      catch (error) {
        rows.push({
          version: versionMeta.version,
          root: versionMeta.root,
          ...projectMeta,
          error: error instanceof Error ? error.message : String(error),
        })
        process.stdout.write(`[${versionMeta.version}/${projectMeta.key}] ERROR\n`)
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    versions,
    projects,
    selectedProjectKeys: selectedProjects.map(project => project.key),
    rows,
  }

  await fs.writeFile(path.resolve(output), JSON.stringify(report, null, 2), 'utf8')
  process.stdout.write(`matrix raw -> ${path.resolve(output)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
