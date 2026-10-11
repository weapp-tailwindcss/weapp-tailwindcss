import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { commands, coverage } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { insertProbe } from '../../../scripts/ci/demo-matrix/probe.mjs'
import { configure } from './configs.mjs'
import { cleanCache, compareCommonLocks, createConsumer, install, keepLockEvidence, prepareLock, seedPreparationStore } from './fixtures.mjs'
import { modes } from './model.mjs'
import { compileStatic, sourceFiles, stripSourceGeneration, applySources } from './precompile.mjs'
import { assertPublished, hash, installationLayout } from './published.mjs'
import { run } from './process.mjs'
import { prepareSteps, styleSavePolicy } from './steps.mjs'
import { frameworkCompatibility } from './capture.cjs'
import { plainRuntimeMarkers } from './runtime-marker.mjs'
import { interSaveQuietMs } from './save-pacing.mjs'

export async function prepareTarget(item, published, directory, logs) {
  await mkdir(logs, { recursive: true })
  const consumers = {}
  const locks = {}
  for (const mode of ['enabled', 'native', 'static']) {
    const consumer = await createConsumer(item, published, directory, mode)
    consumers[mode] = consumer
    if (mode !== 'enabled') await seedPreparationStore(path.join(directory, 'enabled-store'), path.join(directory, `${mode}-store`))
    locks[mode] = (await prepareLock(consumer, path.join(directory, `${mode}-store`), logs)).lock
    await install(consumer, path.join(directory, `${mode}-store`), path.join(logs, `${mode}-prepare-install.log`))
    await keepLockEvidence(consumer, path.join(logs, 'dependencies'))
  }
  compareCommonLocks(locks.native, locks.static)
  compareCommonLocks(locks.native, locks.enabled)
  const evidence = item.name.startsWith('style-injector-') ? { integration: 'weapp-style-injector' } : await assertPublished(consumers.enabled.project, published)
  return prepareInstalledTarget(item, consumers, locks, logs, evidence)
}

// 安装身份由调用方验证；发布版入口仍强制执行 assertPublished。
export async function prepareInstalledTarget(item, consumers, locks, logs, evidence) {
  evidence.installationLayout = installationLayout(item)
  evidence.profiling = 'disabled'
  evidence.pageObservation = { version: 2, linkedStyles: 'browser-response-body', topology: item.family === 'nuxt' ? 'application-and-teleports-excluding-recorded-nuxt-devtools' : 'body' }
  evidence.frameworkPatches = Object.fromEntries(await Promise.all(modes.map(async mode => [mode, JSON.parse(await readFile(path.join(consumers[mode].project, '.cost', 'framework-patches.json'), 'utf8'))])))
  const consumer = consumers.enabled
  const originals = new Map(await Promise.all((await sourceFiles(consumer)).map(async file => [file, await readFile(path.join(consumer.project, file), 'utf8')])))
  const ordinary = await plainRuntimeMarkers(originals)
  if ([...ordinary].some(([file, source]) => source !== originals.get(file))) {
    // 基线移除包导入前先核验本轮发布实现，不能把未来不同语义的 helper 偷换为内建函数。
    const require = createRequire(path.join(consumer.project, 'package.json'))
    assert.equal(require('weapp-tailwindcss/escape').weappTwIgnore, String.raw)
    evidence.runtimeMarker = 'weappTwIgnore === String.raw'
  }
  const captureFile = path.join(logs, 'options.jsonl')
  const restore = await configure(consumer, 'capture')
  const command = commands(item)
  try {
    await run('pnpm', command.build, { cwd: consumer.project, env: { ...command.env, WEAPP_DEMO_COST_CAPTURE: captureFile }, logFile: path.join(logs, 'capture.log') })
  }
  finally { await restore() }
  const records = (await readFile(captureFile, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
  evidence.baselineCompatibility = frameworkCompatibility(records)
  await configure(consumers.native, 'disabled', records, consumer.project)
  await configure(consumers.static, 'disabled', records, consumer.project)
  const steps = Object.fromEntries(modes.map(mode => [mode, new Map()]))
  if (coverage(item) === 'native-build') {
    const source = `${await insertProbe(originals.get(item.source), item, 'initial')}\n// COST_SEQUENCE\n`
    // RN 的插件默认禁用，三组保留同一原生页面，不计为 Tailwind 生成性能。
    for (const mode of modes) steps[mode].set('initial', new Map([[item.source, source.replace('tw-matrix-native-app', 'tw-matrix-native-app COST_SEQUENCE')]]))
  }
  else {
    const changes = await prepareSteps(consumer, records)
    for (const [operation, change] of changes) {
      await applySources(consumer, originals)
      await applySources(consumer, change)
      steps.enabled.set(operation, new Map([...originals, ...change]))
      const compiled = await compileStatic(consumer, records, consumer.project)
      steps.static.set(operation, await plainRuntimeMarkers(new Map([...originals, ...change, ...compiled])))
      const native = new Map([...originals, ...change])
      for (const [file, text] of native) {
        native.set(file, stripSourceGeneration(text, file))
      }
      steps.native.set(operation, await plainRuntimeMarkers(native))
    }
  }
  await applySources(consumer, originals)
  // 趋势只比较相同原生输入和基线依赖图；被测发布版的自身变化不放入兼容性身份。
  evidence.comparisonIdentity = {
    pageObservation: evidence.pageObservation,
    interSaveQuietMs,
    styleSavePolicy,
    installationLayout: evidence.installationLayout,
    nativeLock: hash(await readFile(path.join(consumers.native.project, 'pnpm-lock.yaml'), 'utf8')),
    staticLock: hash(await readFile(path.join(consumers.static.project, 'pnpm-lock.yaml'), 'utf8')),
    scenario: hash(JSON.stringify([...steps.native].map(([operation, sources]) => [operation, [...sources].sort(([a], [b]) => a.localeCompare(b))]))),
  }
  await writeFile(path.join(logs, 'static-inputs.json'), JSON.stringify([...steps.static].map(([operation, sources]) => ({ operation, sources: Object.fromEntries(sources) }))))
  for (const mode of modes) await cleanCache(consumers[mode], command.output)
  assert.ok(steps.enabled.size)
  await writeFile(path.join(logs, 'isolation.json'), JSON.stringify({ evidence, locks: Object.fromEntries(modes.map(mode => [mode, Object.keys(locks[mode].packages).length])) }, null, 2))
  return { consumers, steps, locks, evidence }
}
