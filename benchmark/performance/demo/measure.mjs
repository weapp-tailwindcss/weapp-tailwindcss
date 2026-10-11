import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'
import { commands } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { assertGulpWatchBuildComplete, assertMpxWatchBuildComplete, assertTaroWatchBuildComplete, assertUniWatchBuildComplete, assertViteWatchBuildComplete, developmentEnvironment, freePort } from '../../../scripts/ci/demo-matrix/process.mjs'
import { canonicalStyleEvidence } from './css-values.mjs'
import { saveWatchFailure } from './failure-evidence.mjs'
import { cleanCache } from './fixtures.mjs'
import { operations, order } from './model.mjs'
import { browserTarget, inspectOutput, observePage } from './observe.mjs'
import { run, startProcess, waitFor } from './process.mjs'
import { hash } from './published.mjs'
import { createSavePacer, interSaveQuietMs } from './save-pacing.mjs'
import { planStep, writeStep } from './steps.mjs'
import { withSerialWatchers } from './watch-lifetime.mjs'

function equivalent(results) {
  assert.deepEqual(canonicalStyleEvidence(results.static), canonicalStyleEvidence(results.enabled), '静态组与接入组的实际样式或页面结构不等价')
}

async function keepSemantic(result, mode, metric, round, options) {
  const directory = path.join(options.logs, 'semantic')
  await mkdir(directory, { recursive: true })
  const content = JSON.stringify(result, null, 2)
  await writeFile(path.join(directory, `${mode}-${metric}-${round}.json`), content)
  return hash(content)
}

export async function measureBuild(prepared, rows, options) {
  const { consumers, steps } = prepared
  for (const metric of ['build.cold', 'build.warm']) {
    if (!rows[metric]) {
      continue
    }
    try {
      for (let round = 0; round < options.runs; round++) {
        const results = {}
        for (const mode of order(round, options.reverse)) {
          const consumer = consumers[mode]
          const command = commands(consumer.item)
          const marker = `cost-${randomUUID()}`
          await writeStep(consumer, steps[mode].get('initial'), marker)
          if (metric === 'build.cold') {
            await cleanCache(consumer, command.output)
          }
          else {
            if (round === 0) {
              await run('pnpm', command.build, { cwd: consumer.project, env: command.env, logFile: path.join(options.logs, `${mode}-warm-prime.log`) })
            }
            // 保留编译器缓存，但删除旧产物，确保检查本轮真实输出。
            await rm(path.join(consumer.project, command.output), { recursive: true, force: true })
          }
          const sample = await run('pnpm', command.build, { cwd: consumer.project, env: command.env, logFile: path.join(options.logs, `${mode}-${metric}-${round}.log`), timeout: options.timeout })
          const result = await inspectOutput(consumer, path.join(consumer.project, command.output), 'initial', marker)
          results[mode] = result
          sample.semanticHash = await keepSemantic(result, mode, metric, round, options)
          delete sample.stdout
          rows[metric].samples[mode].push({ ...sample, round, marker, cache: metric.endsWith('cold') ? 'project-cache-cleared' : 'project-cache-retained' })
          await options.checkpoint?.()
        }
        equivalent(results)
      }
      rows[metric].status = 'passed'
      rows[metric].semanticVerified = true
    }
    catch (error) {
      rows[metric].status = 'failed'
      rows[metric].error = error.stack
      // 仅在计时结束后的失败路径保留原始产物，便于核验变量作用域、异步样式与原生 marker。
      for (const [mode, consumer] of Object.entries(consumers)) {
        const output = path.join(consumer.project, commands(consumer.item).output)
        const destination = path.join(options.logs, 'failed-output', metric, mode)
        try {
          const patterns = consumer.item.target === 'rn' ? ['**/*.js', '**/*.bundle'] : ['**/*.{css,wxss,acss,ttss,qss,jxss,ddss}', '**/*.html']
          for (const file of await fg(patterns, { cwd: output, absolute: true })) {
            const target = path.join(destination, path.relative(output, file))
            await mkdir(path.dirname(target), { recursive: true })
            await cp(file, target)
          }
        }
        catch (evidenceError) {
          rows[metric].error += `\n无法保存 ${mode} 失败产物：${evidenceError.message}`
        }
      }
    }
  }
}

function completeWatcher(session, consumer, offset) {
  const checks = { 'taro': assertTaroWatchBuildComplete, 'uni': assertUniWatchBuildComplete, 'mpx': assertMpxWatchBuildComplete, 'gulp': assertGulpWatchBuildComplete, 'weapp-vite': assertViteWatchBuildComplete }
  const check = checks[consumer.item.family]
  assert.ok(check, '缺少产物 watcher 完成契约')
  check(session.log(), offset)
}

async function startWatcher(consumer, initial, options, suffix) {
  const command = commands(consumer.item, await freePort())
  const marker = `cost-${randomUUID()}`
  await cleanCache(consumer, command.output)
  await writeStep(consumer, initial, marker)
  const logFile = path.join(options.logs, `${consumer.mode}-dev-${suffix}.log`)
  await mkdir(path.dirname(logFile), { recursive: true })
  const session = await startProcess('pnpm', command.dev, { cwd: consumer.project, env: developmentEnvironment(command.env), logFile, timeout: options.timeout * 10 })
  const began = session.startedAt
  let browser
  const check = async (operation, marker, offset = 0) => {
    if (browser) {
      return browser.inspect(consumer, operation, marker)
    }
    completeWatcher(session, consumer, offset)
    return inspectOutput(consumer, path.join(consumer.project, command.output), operation, marker)
  }
  try {
    if (browserTarget(consumer.item)) {
      const index = command.dev.indexOf('--port')
      assert.ok(index >= 0, 'Web 启动命令没有可归属的独立端口')
      browser = await observePage(`http://127.0.0.1:${command.dev[index + 1]}${consumer.item.route ?? '/'}`, session, options.logs)
    }
    const result = await waitFor(() => check('initial', marker), session, options.timeout)
    const sample = { ms: performance.now() - began, peakRssMb: session.memory(), marker, boundary: browser ? 'spawn-to-validated-page' : 'spawn-to-validated-artifact' }
    return {
      session,
      browser,
      check,
      result,
      sample,
      async close() {
        try {
          await browser?.close()
        }
        finally {
          await session.stop()
        }
      },
    }
  }
  catch (error) {
    await browser?.close()
    await session.stop()
    throw error
  }
}

function stylesheetBarrier(mode, watcher, marker, timeout) {
  return {
    afterWrite: mode === 'static' && watcher.browser
      ? async (target) => {
        if (/\.(?:css|scss)$/.test(target)) {
          await waitFor(() => watcher.browser.waitForStylesheetMarker(marker), watcher.session, timeout)
        }
      }
      : undefined,
  }
}

export async function measureWatch(prepared, rows, options) {
  const { consumers, steps } = prepared
  const endpoint = browserTarget(consumers.enabled.item) ? 'page' : 'artifact'
  const startup = rows[`startup.${endpoint}`]
  if (!startup) {
    return
  }
  let context
  try {
    for (let round = 0; round < options.runs; round++) {
      const results = {}
      for (const mode of order(round, options.reverse)) {
        context = { mode, phase: 'startup', round }
        const watcher = await startWatcher(consumers[mode], steps[mode].get('initial'), options, round)
        try {
          watcher.sample.semanticHash = await keepSemantic(watcher.result, mode, `startup.${endpoint}`, round, options)
          startup.samples[mode].push(watcher.sample)
          await options.checkpoint?.()
          results[mode] = watcher.result.topology ?? watcher.result
        }
        finally { await watcher.close() }
      }
      equivalent(results)
    }
    startup.status = 'passed'
    startup.semanticVerified = true
    // 每组在同一个 watcher 中完成整批操作；组间释放进程，避免后台扫描与内存相互干扰。
    const completedModes = new Set()
    const modeOrder = order(options.batchRotation ?? 0, options.reverse)
    await withSerialWatchers(modeOrder, (mode) => {
      context = { mode, phase: 'watcher-startup' }
      return startWatcher(consumers[mode], steps[mode].get('initial'), options, 'hmr')
    }, async (mode, watcher) => {
      const pacer = createSavePacer()
      for (let round = -options.warmups; round < options.hmrRuns; round++) {
        for (const operation of operations.filter(operation => rows[`hmr.${operation}.${endpoint}`])) {
          const consumer = consumers[mode]
          await watcher.browser?.waitForTransport()
          const reset = operation === 'remove' ? 'add' : operation === 'restore' ? 'config' : 'initial'
          const resetMarker = `cost-${randomUUID()}`
          context = { mode, phase: 'reset', operation, reset, round, marker: resetMarker }
          await pacer.beforeSave()
          // 恢复状态同样要等 CSS 挂载，再保存源码；页面 marker 不能证明延迟的 CSS HMR 已结束。
          await (await planStep(consumer, steps[mode].get(reset), resetMarker))(stylesheetBarrier(mode, watcher, resetMarker, options.timeout))
          await waitFor(() => watcher.check(reset, resetMarker), watcher.session, options.timeout)
          pacer.settled()
          await watcher.browser?.waitForTransport()
          const marker = `cost-${randomUUID()}`
          const offset = watcher.session.log().length
          context = { mode, phase: 'measure', operation, round, marker, offset }
          const documents = watcher.browser?.documents()
          const save = await planStep(consumer, steps[mode].get(operation), marker)
          await pacer.beforeSave()
          const began = performance.now()
          await save(stylesheetBarrier(mode, watcher, marker, options.timeout))
          const result = await waitFor(() => watcher.check(operation, marker, offset), watcher.session, options.timeout)
          const sample = { ms: performance.now() - began, peakRssMb: watcher.session.memory(), round, marker, interSaveQuietMs, update: watcher.browser ? watcher.browser.documents() === documents ? 'hmr' : 'reload' : 'native-watch', boundary: `save-to-validated-${endpoint}` }
          pacer.settled()
          sample.semanticHash = await keepSemantic(result, mode, `hmr.${operation}.${endpoint}`, round, options)
          sample.modeOrder = modeOrder
          if (round >= 0) {
            rows[`hmr.${operation}.${endpoint}`].samples[mode].push(sample)
          }
          if (round >= 0) {
            await options.checkpoint?.()
          }
          const counterpart = mode === 'static' ? 'enabled' : mode === 'enabled' ? 'static' : undefined
          if (counterpart && completedModes.has(counterpart)) {
            const previous = JSON.parse(await readFile(path.join(options.logs, 'semantic', `${counterpart}-hmr.${operation}.${endpoint}-${round}.json`), 'utf8'))
            equivalent({ [mode]: result.topology ?? result, [counterpart]: previous.topology ?? previous })
          }
        }
      }
      completedModes.add(mode)
    })
    for (const row of Object.values(rows).filter(row => row.metric.startsWith('hmr.'))) {
      row.status = 'passed'
      row.semanticVerified = true
    }
  }
  catch (error) {
    for (const row of Object.values(rows).filter(row => /^(?:hmr|startup)\./.test(row.metric) && row.status !== 'passed')) {
      row.status = 'failed'
      row.error = error.stack
    }
    if (context) {
      const consumer = consumers[context.mode]
      try {
        // watcher 已退出，再保存实际输入与完整输出；不把诊断 I/O 纳入成功样本计时。
        await saveWatchFailure({
          project: consumer.project,
          inputs: [...steps[context.mode].values()].flatMap(files => [...files.keys()]),
          output: path.join(consumer.project, commands(consumer.item).output),
          destination: path.join(options.logs, 'failed-watch', context.mode),
          context,
          error,
        })
      }
      catch (evidenceError) {
        for (const row of Object.values(rows).filter(row => row.status === 'failed')) {
          row.error += `\n无法保存 watcher 失败现场：${evidenceError.message}`
        }
      }
    }
  }
}
