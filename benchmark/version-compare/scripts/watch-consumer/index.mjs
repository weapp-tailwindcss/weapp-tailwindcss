import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { verifyPreparedRole } from '../source-diagnostics/verify.mjs'
import { consumptionGraph, errorRecord, sha256 } from './consumption-graph.mjs'

const relativeSource = 'benchmark/performance/src/watch-lifecycle.mjs'
const originalHash = '9cc8acb6f5f9f98a864489d26f1d084fe154461a85e9281f5efc35b35dc9a95c'
const targets = new Set(['86c89a2a5c88ebe84cba0dcb46388dccf738bbfb', '13520c530b358a7ca089dd5f84b28e0e8022a4a9'])
function within(root, file) {
  const relative = path.relative(root, file)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}
function replaceOnce(source, original, replacement) {
  assert.equal(source.split(original).length, 2, `Expected one instrumentation anchor: ${original}`)
  return source.replace(original, replacement)
}
const writeJson = (file, value) => fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
const recorderSource = `export const snapshots = []
export function captureWatchBundle(bundle, state) {
  snapshots.push({
    index: snapshots.length + 1, atMs: performance.now(), state,
    outputs: Object.entries(bundle).map(([bundleKey, item]) => item.type === 'asset' ? {
      bundleKey, type: item.type, fileName: item.fileName,
      names: [...(item.names ?? [])], originalFileNames: [...(item.originalFileNames ?? [])],
      source: typeof item.source === 'string' ? item.source : Buffer.from(item.source),
    } : {
      bundleKey, type: item.type, fileName: item.fileName, name: item.name,
      isEntry: item.isEntry, isDynamicEntry: item.isDynamicEntry,
      facadeModuleId: item.facadeModuleId, moduleIds: [...(item.moduleIds ?? [])],
      imports: [...item.imports], dynamicImports: [...item.dynamicImports],
      importedCss: [...(item.viteMetadata?.importedCss ?? [])],
      importedAssets: [...(item.viteMetadata?.importedAssets ?? [])], code: item.code,
    }),
  })
}
`

/** scratch 在源码写入或动态导入失败时也必须回收；原始失败与清理失败分别保留。 */
export async function withScratch(run) {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-watch-observer-'))
  let value
  let primaryError
  try {
    value = await run(scratch)
  }
  catch (error) {
    primaryError = error
  }
  try {
    await fs.rm(scratch, {
      recursive: true,
      force: true,
    })
  }
  catch (cleanupError) {
    if (primaryError) {
      throw new AggregateError([primaryError, cleanupError], 'watch scratch 执行与清理均失败')
    }
    throw cleanupError
  }
  if (primaryError) {
    throw primaryError
  }
  return value
}
async function saveSnapshots(output, snapshots, postcss) {
  for (const snapshot of snapshots) {
    const buildDirectory = path.join(output, `build-${String(snapshot.index).padStart(3, '0')}`)
    const distDirectory = path.join(buildDirectory, 'dist')
    await fs.mkdir(distDirectory, {
      recursive: true,
    })
    for (const item of snapshot.outputs) {
      const logical = item.fileName
      assert(typeof logical === 'string' && !logical.includes('\\') && !path.posix.isAbsolute(logical) && path.posix.normalize(logical) === logical, 'Bundle names must be normalized relative logical paths')
      const file = path.resolve(distDirectory, logical)
      assert(within(distDirectory, file) && file !== distDirectory, 'Bundle output escaped evidence directory')
      await fs.mkdir(path.dirname(file), {
        recursive: true,
      })
      await fs.writeFile(file, item.type === 'asset' ? item.source : item.code)
    }
    await writeJson(path.join(buildDirectory, 'bundle.json'), snapshot)
    await writeJson(path.join(buildDirectory, 'entry-consumption.json'), consumptionGraph(snapshot, postcss))
  }
}
export async function runWatchConsumerDiagnostic({
  sourceRoot: requestedRoot,
  expectedHead,
  preparedRole,
  outputDirectory,
}) {
  const verified = await verifyPreparedRole(preparedRole, {
    phase: 'before',
  })
  assert(targets.has(expectedHead), 'Expected exact old86c89 or13520 target')
  assert.equal(verified.sourceCommit, expectedHead)
  const sourceRoot = await fs.realpath(path.resolve(requestedRoot))
  assert.equal(sourceRoot, verified.root, 'CLI source root must equal verified prepared role')
  const output = path.resolve(outputDirectory)
  assert(!within(sourceRoot, output), 'Evidence must be outside prepared product')
  await fs.mkdir(output, {
    recursive: true,
  })
  assert.equal((await fs.readdir(output)).length, 0, 'Use a new evidence directory')
  const require = createRequire(path.join(sourceRoot, 'package.json'))
  const controller = new AbortController()
  let snapshots = []
  let report
  let primaryError
  let evidenceError
  let verificationError
  let abortSnapshotWrite
  let abortSnapshotError
  let startedAtMs
  let settledAtMs
  let timer
  let loadedProductCjsFiles = []
  try {
    const original = await fs.readFile(path.join(sourceRoot, relativeSource), 'utf8')
    assert.equal(sha256(original), originalHash, 'Original watcher source must be unchanged')
    const ownPath = fileURLToPath(import.meta.url)
    const graphPath = fileURLToPath(new URL('./consumption-graph.mjs', import.meta.url))
    const identity = {
      diagnosticOnly: true,
      budgetAcceptance: false,
      driver: {
        path: ownPath,
        sha256: sha256(await fs.readFile(ownPath)),
        graph: {
          path: graphPath,
          sha256: sha256(await fs.readFile(graphPath)),
        },
      },
      preparedVerification: verified,
      original: {
        path: relativeSource,
        sha256: originalHash,
      },
      parameters: {
        kind: 'vite',
        size: 3,
        warmups: 0,
        runs: 3,
        overallBudgetMs: 30_000,
        nextBuildBudgetMs: 15_000,
      },
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    }
    await withScratch(async (scratch) => {
      const recorderFile = path.join(scratch, 'recorder.mjs')
      const moduleFile = path.join(scratch, 'instrumented-watch-lifecycle.mjs')
      await fs.writeFile(recorderFile, recorderSource)
      let instrumented = replaceOnce(original, 'from \'./stats.mjs\'', `from ${JSON.stringify(pathToFileURL(path.join(sourceRoot, 'benchmark/performance/src/stats.mjs')).href)}`)
      instrumented = replaceOnce(instrumented, 'from \'./watch-lifecycle/control.mjs\'', `from ${JSON.stringify(pathToFileURL(path.join(sourceRoot, 'benchmark/performance/src/watch-lifecycle/control.mjs')).href)}`)
      const anchor = original.split('\n').find(line => line.includes('control.css = Object.values(bundle)'))
      assert(anchor)
      instrumented = `import { captureWatchBundle } from ${JSON.stringify(pathToFileURL(recorderFile).href)}\n${instrumented}`
      instrumented = replaceOnce(instrumented, anchor, `${anchor}\n            captureWatchBundle(bundle, control.snapshot())`)
      await fs.writeFile(moduleFile, instrumented)
      await fs.writeFile(path.join(output, 'original-watch-lifecycle.mjs'), original)
      await fs.writeFile(path.join(output, 'instrumented-watch-lifecycle.mjs'), instrumented)
      await fs.writeFile(path.join(output, 'recorder.mjs'), recorderSource)
      identity.instrumentedSha256 = sha256(instrumented)
      await writeJson(path.join(output, 'identity.json'), identity);
      ({
        snapshots,
      } = await import(pathToFileURL(recorderFile).href))
      const {
        measureWatchLifecycle,
      } = await import(pathToFileURL(moduleFile).href)
      startedAtMs = performance.now()
      timer = setTimeout(() => {
        controller.abort(new Error('Original 30000ms diagnostic deadline'))
        abortSnapshotWrite = writeJson(path.join(output, 'abort-snapshots.json'), {
          status: 'partial-after-original-budget-abort',
          expectedHead,
          originalHash,
          snapshots,
        }).catch((error) => {
          abortSnapshotError = error
        })
      }, 30_000)
      try {
        report = await measureWatchLifecycle({
          sourceRoot,
          kind: 'vite',
          size: 3,
          warmups: 0,
          runs: 3,
          signal: controller.signal,
        })
        assert.equal(report.samples.length, 3)
        assert.equal(new Set(report.samples.map(sample => sample.outputHash)).size, 1)
        assert.equal(report.time.count, 3)
        const golden = await fs.readFile(path.join(sourceRoot, 'benchmark/performance/test/fixtures/watch/vite.css'), 'utf8')
        assert.equal(report.outputCss, golden)
        assert.equal(controller.signal.aborted, false)
      }
      finally {
        settledAtMs = performance.now()
        clearTimeout(timer)
        await abortSnapshotWrite
      }
    })
  }
  catch (error) {
    primaryError = error
  }
  finally {
    clearTimeout(timer)
    loadedProductCjsFiles = Object.keys(require.cache).filter(file => within(sourceRoot, file))
    try {
      const {
        postcss,
      } = require('@weapp-tailwindcss/postcss')
      await saveSnapshots(output, snapshots, postcss)
      if (report) {
        await writeJson(path.join(output, 'report.json'), report)
      }
    }
    catch (error) {
      evidenceError = error
    }
    try {
      await verifyPreparedRole(preparedRole, {
        phase: 'after',
      })
    }
    catch (error) {
      verificationError = error
    }
  }
  const result = {
    diagnosticOnly: true,
    budgetAcceptance: false,
    passed: !primaryError && !evidenceError && !verificationError && !abortSnapshotError,
    outputDirectory: output,
    originalFlow: primaryError ? 'failed' : 'passed',
    evidence: evidenceError ? 'failed' : 'saved',
    startedAtMs,
    settledAtMs,
    elapsedMs: startedAtMs === undefined ? undefined : settledAtMs - startedAtMs,
    aborted: controller.signal.aborted,
    capturedBuilds: snapshots.length,
    error: primaryError && errorRecord(primaryError),
    evidenceError: evidenceError && errorRecord(evidenceError),
    verificationError: verificationError && errorRecord(verificationError),
    loadedProductCjsFiles,
    abortSnapshotError: abortSnapshotError && errorRecord(abortSnapshotError),
    limits: ['Diagnostic evidence only; instrumentation is not a performance gate result', 'No dynamic import or runtime browser load-order claim', 'CSS @import or missing JS entries require further graph analysis'],
  }
  await writeJson(path.join(output, 'result.json'), result)
  return result
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 6, 'Usage: node index.mjs <prepared-source-root> <expected-full-head> <serialized-prepared-role-json> <external-output-directory>')
  const preparedRole = JSON.parse(await fs.readFile(path.resolve(process.argv[4]), 'utf8'))
  const result = await runWatchConsumerDiagnostic({
    sourceRoot: process.argv[2],
    expectedHead: process.argv[3],
    preparedRole,
    outputDirectory: process.argv[5],
  })
  if (!result.passed) {
    process.exitCode = 1
  }
  console.log(result.outputDirectory)
}
