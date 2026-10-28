import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { classifyPerformanceChanges, performanceRelevantPaths, summarizeFiles } from './change-relevance.mjs'
import {
  asInformationalPerformanceGuard,
  buildSummary,
  evaluatePerformanceGuard,
  requiresHmrMemoryConfirmation,
  toMarkdown,
} from './ci-report.mjs'
import { validateAllocationRequest } from './diagnostics/constants.mjs'
import { runHmrMemoryConfirmation } from './memory-confirmation.mjs'
import { assertBenchmarkMatrixRows, selectBenchmarkProjects } from './project-selection.mjs'
import { benchmarkProjectDirs } from './projects.mjs'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../../..')
const packageJsonPath = path.join(repoRoot, 'packages/weapp-tailwindcss/package.json')

const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const publishedResolverDependencyNames = [
  '@weapp-core/escape',
  '@weapp-tailwindcss/escape',
]
function parseArg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback)
}

function parseNumber(name, fallback) {
  const value = Number(parseArg(name, ''))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function inferBaseline(version) {
  const requested = parseArg('--baseline', process.env.WEAPP_TW_BENCH_BASELINE ?? 'auto')
  if (requested && requested !== 'auto') {
    return requested
  }
  const match = version.match(/-(alpha|beta|rc|next)(?:\.|$)/)
  return `weapp-tailwindcss@${match?.[1] ?? 'latest'}`
}

function normalizePackageSpec(value) {
  if (value.startsWith('weapp-tailwindcss@')) {
    return value
  }
  return `weapp-tailwindcss@${value}`
}

function asDependencySpec(value) {
  return `npm:${normalizePackageSpec(value)}`
}

function rel(file) {
  return path.relative(repoRoot, file) || '.'
}

async function run(cwd, command, args, options = {}) {
  process.stdout.write(`$ ${command} ${args.join(' ')} (${rel(cwd)})\n`)
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CI: '1',
      HUSKY: '0',
      LEFTHOOK: '0',
      ...options.env,
    },
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', exitCode => resolve(exitCode ?? 1))
  })
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${code}`)
  }
}

async function runCapture(cwd, command, args, options = {}) {
  process.stdout.write(`$ ${command} ${args.join(' ')} (${rel(cwd)})\n`)
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CI: '1',
      HUSKY: '0',
      LEFTHOOK: '0',
      ...options.env,
    },
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', exitCode => resolve(exitCode ?? 1))
  })
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${code}\n${stderr.slice(-4000)}`)
  }
  return stdout
}

async function hasGitChanges(ref, paths) {
  const child = spawn('git', ['diff', '--quiet', ref, '--', ...paths], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', exitCode => resolve(exitCode ?? 1))
  })
  if (code === 0) {
    return false
  }
  if (code === 1) {
    return true
  }
  throw new Error(`unable to compare benchmark sources against ${ref}: git diff exited with ${code}\n${stderr}`)
}

function shouldCopy(src) {
  const relative = path.relative(repoRoot, src)
  if (!relative) {
    return true
  }
  const parts = relative.split(path.sep)
  if (parts.some(part => part === '.git' || part === 'node_modules' || part === '.tmp')) {
    return false
  }
  if (parts.some(part => part === '.turbo' || part === 'coverage' || part === 'coverage-vitest' || part === 'dist')) {
    return false
  }
  if (relative === 'benchmark/framework-compare/projects') {
    return false
  }
  if (relative === 'e2e/benchmark/e2e-watch-hmr') {
    return false
  }
  if (relative === 'website/.vitepress/dist') {
    return false
  }
  return !relative.endsWith('.log') && !relative.endsWith('.tsbuildinfo')
}

async function copyRepo(target) {
  await fs.rm(target, { recursive: true, force: true })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.cp(repoRoot, target, {
    recursive: true,
    dereference: false,
    filter: shouldCopy,
  })
}

async function copyRepoAtRef(target, ref) {
  await fs.rm(target, { recursive: true, force: true })
  await fs.mkdir(target, { recursive: true })
  const archive = spawn('git', ['archive', '--format=tar', ref], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const extract = spawn('tar', ['-xf', '-', '-C', target], {
    stdio: ['pipe', 'inherit', 'pipe'],
  })
  archive.stdout.pipe(extract.stdin)
  let archiveError = ''
  let extractError = ''
  archive.stderr.on('data', (chunk) => {
    archiveError += chunk.toString('utf8')
  })
  extract.stderr.on('data', (chunk) => {
    extractError += chunk.toString('utf8')
  })
  const [archiveCode, extractCode] = await Promise.all([
    new Promise((resolve, reject) => {
      archive.once('error', reject)
      archive.once('close', code => resolve(code ?? 1))
    }),
    new Promise((resolve, reject) => {
      extract.once('error', reject)
      extract.once('close', code => resolve(code ?? 1))
    }),
  ])
  if (archiveCode !== 0 || extractCode !== 0) {
    throw new Error(`unable to prepare git baseline ${ref}: git=${archiveCode} tar=${extractCode}\n${archiveError}\n${extractError}`)
  }
}

function pickPublishedResolverDependencies(dependencies = {}) {
  return Object.fromEntries(publishedResolverDependencyNames.flatMap((name) => {
    const spec = dependencies[name]
    return typeof spec === 'string' ? [[name, spec]] : []
  }))
}

async function readPublishedDependencies(baseline, fallbackDependencies) {
  try {
    const stdout = await runCapture(repoRoot, 'pnpm', ['view', normalizePackageSpec(baseline), 'dependencies', '--json'])
    return JSON.parse(stdout)
  }
  catch (error) {
    process.stdout.write(`[benchmark] unable to read published dependencies, fallback to local package metadata: ${error instanceof Error ? error.message : String(error)}\n`)
    return fallbackDependencies
  }
}

function hasDependency(json, name) {
  return dependencyFields.some(field => Boolean(json[field]?.[name]))
}

function patchPublishedResolverDependencies(json, resolverDependencies) {
  const entries = Object.entries(resolverDependencies)
  if (entries.length === 0) {
    return
  }

  json.devDependencies ??= {}
  for (const [name, spec] of entries) {
    if (!hasDependency(json, name)) {
      json.devDependencies[name] = spec
    }
  }
}

async function patchPackageJson(file, baseline, resolverDependencies) {
  try {
    await fs.access(file)
  }
  catch {
    process.stdout.write(`[benchmark] skip missing package.json: ${rel(file)}\n`)
    return false
  }

  const source = await fs.readFile(file, 'utf8')
  const json = JSON.parse(source)
  let changed = false
  for (const field of dependencyFields) {
    const deps = json[field]
    if (deps?.['weapp-tailwindcss']) {
      deps['weapp-tailwindcss'] = asDependencySpec(baseline)
      changed = true
    }
  }
  if (changed) {
    patchPublishedResolverDependencies(json, resolverDependencies)
    await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  }
  return changed
}

async function patchPublishedRoot(root, baseline, resolverDependencies) {
  const patched = []
  for (const projectDir of benchmarkProjectDirs) {
    const file = path.join(root, projectDir, 'package.json')
    if (await patchPackageJson(file, baseline, resolverDependencies)) {
      patched.push(projectDir)
    }
  }
  await patchPublishedRootOverrides(root)
  return patched
}

async function patchPublishedRootOverrides(root) {
  const file = path.join(root, 'package.json')
  const json = JSON.parse(await fs.readFile(file, 'utf8'))
  json.pnpm ??= {}
  json.pnpm.overrides ??= {}
  json.pnpm.overrides['tailwindcss-config'] = 'link:packages/tailwindcss-config'
  await fs.writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

async function prepareRoot({ root, role, baseline, baselineRef, resolverDependencies, allocationDirectory, diagnosticProject }) {
  if (role === 'base') {
    await copyRepoAtRef(root, baselineRef)
  }
  else {
    await copyRepo(root)
  }
  if (role === 'published') {
    const patched = await patchPublishedRoot(root, baseline, resolverDependencies)
    process.stdout.write(`[benchmark] published baseline ${normalizePackageSpec(baseline)} patched projects: ${patched.join(', ')}\n`)
  }
  if (allocationDirectory) {
    const { prepareAllocationRoot } = await import('./diagnostics/prepare.mjs')
    await prepareAllocationRoot(root, repoRoot, path.join(allocationDirectory, role), diagnosticProject)
  }
  await run(root, 'pnpm', ['install', role === 'published' ? '--no-frozen-lockfile' : '--frozen-lockfile'])
  if (allocationDirectory) {
    const { prepareViteTailDependencies } = await import('./diagnostics/vite-tail-dependencies.mjs')
    await prepareViteTailDependencies(root, repoRoot, path.join(allocationDirectory, role), diagnosticProject)
  }
  await run(root, 'pnpm', ['build:pkgs'])
}

async function appendStepSummary(reportPath) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return
  }
  const markdown = await fs.readFile(reportPath, 'utf8')
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8')
}

async function runSourceCandidateHotUpdateBenchmark(root) {
  const sourceFile = path.join(root, 'packages/weapp-tailwindcss/src/bundlers/vite/source-candidates.ts')
  const tsconfig = path.join(root, 'packages/weapp-tailwindcss/tsconfig.json')
  const script = path.join(repoRoot, 'benchmark/version-compare/scripts/source-candidate-hot-update.mts')
  const stdout = await runCapture(root, process.execPath, [
    '--expose-gc',
    '--import',
    'tsx',
    script,
    sourceFile,
  ], {
    env: {
      TSX_TSCONFIG_PATH: tsconfig,
    },
  })
  const outputLine = stdout.trim().split(/\r?\n/).at(-1)
  if (!outputLine) {
    throw new Error(`source candidate benchmark did not produce output for ${root}`)
  }
  return JSON.parse(outputLine)
}

async function runProcessedCssCoverageBenchmark(root) {
  const sourceFile = path.join(root, 'packages/weapp-tailwindcss/src/bundlers/vite/processed-css-assets.ts')
  const tsconfig = path.join(root, 'packages/weapp-tailwindcss/tsconfig.json')
  const script = path.join(repoRoot, 'benchmark/version-compare/scripts/processed-css-coverage.mts')
  const stdout = await runCapture(root, 'pnpm', [
    'exec',
    'tsx',
    '--tsconfig',
    tsconfig,
    script,
    sourceFile,
  ])
  const outputLine = stdout.trim().split(/\r?\n/).at(-1)
  if (!outputLine) {
    throw new Error(`processed css coverage benchmark did not produce output for ${root}`)
  }
  return JSON.parse(outputLine)
}

async function runProcessedCssInjectionBenchmark(root) {
  const sourceFile = path.join(root, 'packages/weapp-tailwindcss/src/bundlers/vite/processed-css-assets.ts')
  const tsconfig = path.join(root, 'packages/weapp-tailwindcss/tsconfig.json')
  const script = path.join(repoRoot, 'benchmark/version-compare/scripts/processed-css-injection.mts')
  const stdout = await runCapture(root, 'pnpm', [
    'exec',
    'tsx',
    '--tsconfig',
    tsconfig,
    script,
    sourceFile,
  ])
  const outputLine = stdout.trim().split(/\r?\n/).at(-1)
  if (!outputLine) {
    throw new Error(`processed css injection benchmark did not produce output for ${root}`)
  }
  return JSON.parse(outputLine)
}

function createSourceCandidateBenchmarkRow(version, root, result) {
  return {
    version,
    root,
    key: 'core-source-candidate-hot-update',
    project: 'packages/weapp-tailwindcss',
    target: 'core',
    buildMode: 'unsupported',
    buildNote: 'internal hot-update micro benchmark',
    hmrMode: 'watch',
    hmrNote: 'plugin-only source candidate hot-update micro benchmark',
    hmrPluginStatistic: 'median',
    buildMs: [],
    buildPluginMs: [],
    hmrMs: [],
    hmrPluginMs: result.samples,
    memoryStability: result.memoryStability,
    summary: {
      hmrPlugin: result.summary,
      hmrPluginSteady: result.summary,
    },
  }
}

function createProcessedCssCoverageBenchmarkRow(version, root, result) {
  return {
    version,
    root,
    key: 'core-vite-processed-css-coverage',
    project: 'packages/weapp-tailwindcss',
    target: 'core',
    buildMode: 'unsupported',
    buildNote: 'internal processed css coverage micro benchmark',
    hmrMode: 'watch',
    hmrNote: 'plugin-only processed css coverage micro benchmark',
    hmrPluginStatistic: 'median',
    buildMs: [],
    buildPluginMs: [],
    hmrMs: [],
    hmrPluginMs: result.samples,
    summary: {
      hmrPlugin: result.summary,
      hmrPluginSteady: result.summary,
    },
  }
}

function createProcessedCssInjectionBenchmarkRow(version, root, result) {
  return {
    version,
    root,
    key: 'core-vite-processed-css-injection',
    project: 'packages/weapp-tailwindcss',
    target: 'core',
    buildMode: 'unsupported',
    buildNote: 'internal processed css injection micro benchmark',
    hmrMode: 'watch',
    hmrNote: 'plugin-only processed css injection micro benchmark',
    hmrPluginStatistic: 'median',
    buildMs: [],
    buildPluginMs: [],
    hmrMs: [],
    hmrPluginMs: result.samples,
    summary: {
      hmrPlugin: result.summary,
      hmrPluginSteady: result.summary,
    },
  }
}

async function main() {
  const only = process.argv.includes('--only') ? parseArg('--only') : undefined
  const selectedProjects = selectBenchmarkProjects(only)
  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
  const guardMode = process.argv.includes('--guard')
  const baselineRef = parseArg('--baseline-ref', process.env.WEAPP_TW_BENCH_BASE_REF ?? (guardMode ? 'origin/main' : ''))
  const baseline = inferBaseline(pkg.version)
  const publishedDependencies = baselineRef
    ? pkg.dependencies ?? {}
    : await readPublishedDependencies(baseline, pkg.dependencies ?? {})
  const resolverDependencies = pickPublishedResolverDependencies(publishedDependencies)
  const outputRoot = path.resolve(parseArg('--work-root', path.join(os.tmpdir(), `weapp-tailwindcss-benchmark-${process.pid}`)))
  const resultDir = path.resolve(parseArg('--result-dir', path.join(outputRoot, 'result')))
  const currentRoot = path.join(outputRoot, 'current')
  const baselineRoot = path.join(outputRoot, baselineRef ? 'base' : 'published')
  const rawPath = path.resolve(parseArg('--out', path.join(resultDir, 'matrix-raw.json')))
  const reportPath = path.resolve(parseArg('--report', path.join(resultDir, 'report.md')))
  const summaryPath = path.resolve(parseArg('--summary', path.join(resultDir, 'summary.json')))
  const buildRuns = parseNumber('--build-runs', 3)
  const hmrRuns = parseNumber('--hmr-runs', 5)
  const timeoutMs = parseNumber('--timeout', 180000)
  const pollIntervalMs = parseNumber('--poll-interval', 30)
  const baselineLabel = baselineRef
    ? `base:${baselineRef}`
    : `published:${normalizePackageSpec(baseline)}`
  const currentLabel = `current:${pkg.version}`
  const versionsPath = path.join(resultDir, 'versions.json')
  const allocationDiagnostics = process.argv.includes('--allocation-diagnostics')
  const inputDiagnostics = process.argv.includes('--input-diagnostics')
  if (allocationDiagnostics && inputDiagnostics) {
    throw new Error('输入证据与分配采样必须分开运行')
  }
  const instrumentationEnabled = allocationDiagnostics || inputDiagnostics
  validateAllocationRequest({ enabled: instrumentationEnabled, guardMode, baselineRef, selectedProjects, buildRuns, hmrRuns })
  const allocationDirectory = instrumentationEnabled ? path.join(resultDir, 'allocation-preparation') : undefined

  await fs.mkdir(resultDir, { recursive: true })
  await prepareRoot({ root: currentRoot, role: 'current', baseline, baselineRef, resolverDependencies, allocationDirectory, diagnosticProject: selectedProjects[0]?.key })
  await prepareRoot({
    root: baselineRoot,
    role: baselineRef ? 'base' : 'published',
    baseline,
    baselineRef,
    resolverDependencies,
    allocationDirectory,
    diagnosticProject: selectedProjects[0]?.key,
  })
  const gcDiagnosticsEnabled = process.env.WEAPP_TW_BENCH_GC_DIAGNOSTICS === '1' || instrumentationEnabled
  let diagnosticIdentity
  if (gcDiagnosticsEnabled) {
    try {
      diagnosticIdentity = {
        current: {
          role: 'current',
          sourceCommit: (await runCapture(repoRoot, 'git', ['rev-parse', 'HEAD'])).trim(),
          sourceWorkingTreeStatus: (await runCapture(repoRoot, 'git', ['status', '--porcelain'])).trim(),
        },
        baseline: {
          role: baselineRef ? 'base' : 'published',
          sourceCommit: baselineRef ? (await runCapture(repoRoot, 'git', ['rev-parse', `${baselineRef}^{commit}`])).trim() : undefined,
          packageSpec: baselineRef ? undefined : normalizePackageSpec(baseline),
        },
      }
    }
    catch (error) {
      const sourceIdentityError = error instanceof Error ? error.message : String(error)
      diagnosticIdentity = { current: { role: 'current', sourceIdentityError }, baseline: { role: baselineRef ? 'base' : 'published', sourceIdentityError } }
      process.stderr.write(`[benchmark-gc] 源码身份缺证：${sourceIdentityError}\n`)
    }
  }
  const currentVersion = { version: currentLabel, root: currentRoot, ...(diagnosticIdentity ? { diagnosticIdentity: diagnosticIdentity.current } : {}) }
  const baselineVersion = { version: baselineLabel, root: baselineRoot, ...(diagnosticIdentity ? { diagnosticIdentity: diagnosticIdentity.baseline } : {}) }
  await fs.writeFile(versionsPath, JSON.stringify([
    baselineVersion,
    currentVersion,
  ], null, 2), 'utf8')

  const runMatrix = async ({ versionsFile, outputFile, matrixBuildRuns }) => {
    const matrixArgs = [
      path.join(repoRoot, 'benchmark/version-compare/scripts/run-matrix.mjs'),
      '--versions-file',
      versionsFile,
      '--build-runs',
      String(matrixBuildRuns),
      '--hmr-runs',
      String(hmrRuns),
      '--timeout',
      String(timeoutMs),
      '--poll-interval',
      String(pollIntervalMs),
      '--out',
      outputFile,
    ]
    if (only) {
      matrixArgs.push('--only', only)
    }
    if (gcDiagnosticsEnabled) {
      matrixArgs.push('--gc-diagnostic-dir', path.join(resultDir, 'gc-diagnostics', path.basename(outputFile, '.json')))
    }
    if (allocationDiagnostics) {
      matrixArgs.push('--allocation-diagnostics')
    }
    if (inputDiagnostics) {
      matrixArgs.push('--input-diagnostics')
    }
    await run(repoRoot, process.execPath, matrixArgs)
  }
  await runMatrix({ versionsFile: versionsPath, outputFile: rawPath, matrixBuildRuns: buildRuns })

  const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'))
  assertBenchmarkMatrixRows(raw, selectedProjects, [baselineVersion, currentVersion], { buildRuns, hmrRuns })
  if (instrumentationEnabled) {
    const failed = raw.rows.filter(row => row.error)
    if (failed.length) {
      throw new Error(`分配诊断有失败或缺证：${JSON.stringify(failed.map(row => ({ version: row.version, error: row.error })))}`)
    }
    const { compareDiagnosticInputs } = await import('./diagnostics/compare.mjs')
    const inputComparison = await compareDiagnosticInputs(path.join(resultDir, 'gc-diagnostics', path.basename(rawPath, '.json')))
    await fs.writeFile(path.join(resultDir, 'diagnostic-input-comparison.json'), JSON.stringify(inputComparison, null, 2))
    await fs.writeFile(path.join(resultDir, 'allocation-diagnostic.json'), JSON.stringify({
      diagnosticOnly: true,
      mode: allocationDiagnostics ? 'allocation' : 'inputs',
      budgetAcceptance: false,
      reason: '插桩与 inspector 观测的时间、RSS 只作诊断，不进入正式预算或反序确认',
      versions: [baselineVersion, currentVersion],
      rawPath,
      buildRuns,
      hmrRuns,
    }, null, 2))
    return
  }
  const performanceChanges = baselineRef
    ? await classifyPerformanceChanges(repoRoot, baselineRef)
    : { relevant: true, relevantFiles: performanceRelevantPaths, ignoredReleaseMetadataFiles: [], ignoredNonPerformanceFiles: [] }
  const performanceRelevantChanges = performanceChanges.relevant
  if (baselineRef && !process.argv.includes('--skip-core-metrics')) {
    const coreMetricSpecs = [
      {
        key: 'core-source-candidate-hot-update',
        paths: ['packages/weapp-tailwindcss/src/bundlers/vite/source-candidates.ts'],
        run: runSourceCandidateHotUpdateBenchmark,
        createRow: createSourceCandidateBenchmarkRow,
      },
      {
        key: 'core-vite-processed-css-coverage',
        paths: ['packages/weapp-tailwindcss/src/bundlers/vite/processed-css-assets.ts'],
        run: runProcessedCssCoverageBenchmark,
        createRow: createProcessedCssCoverageBenchmarkRow,
      },
      {
        key: 'core-vite-processed-css-injection',
        paths: ['packages/weapp-tailwindcss/src/bundlers/vite/processed-css-assets.ts'],
        run: runProcessedCssInjectionBenchmark,
        createRow: createProcessedCssInjectionBenchmarkRow,
      },
    ]
    for (const spec of coreMetricSpecs) {
      if (!await hasGitChanges(baselineRef, spec.paths)) {
        process.stdout.write(`[benchmark] skip unchanged core metric ${spec.key}\n`)
        continue
      }
      const baselineResult = await spec.run(baselineRoot)
      const currentResult = await spec.run(currentRoot)
      raw.rows.push(
        spec.createRow(baselineLabel, baselineRoot, baselineResult),
        spec.createRow(currentLabel, currentRoot, currentResult),
      )
    }
    await fs.writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
  }
  const summary = buildSummary(raw, baselineLabel, currentLabel)
  if (baselineRef) {
    let performanceGuard = evaluatePerformanceGuard(summary, {
      regressionPercent: parseNumber('--regression-percent', 5),
      minimumTailRegressionSamples: parseNumber('--minimum-tail-samples', 2),
      minimumTimingRegressionMs: parseNumber('--minimum-timing-ms', 10),
      minimumMemoryRegressionMb: parseNumber('--minimum-memory-mb', 64),
    })
    if (
      performanceRelevantChanges
      && requiresHmrMemoryConfirmation(performanceGuard)
      && !process.argv.includes('--skip-memory-confirmation')
    ) {
      performanceGuard = await runHmrMemoryConfirmation({
        resultDir,
        currentVersion,
        baselineVersion,
        performanceGuard,
        regressionPercent: parseNumber('--regression-percent', 5),
        hmrRuns,
        selectedProjects,
        runMatrix,
      })
    }
    const relevantFiles = summarizeFiles(performanceChanges.relevantFiles)
    const ignoredFiles = summarizeFiles(performanceChanges.ignoredReleaseMetadataFiles)
    const ignoredNonPerformanceFiles = summarizeFiles(performanceChanges.ignoredNonPerformanceFiles)
    const informationalReason = ignoredNonPerformanceFiles
      ? `PR 仅修改不影响性能的构建守卫文件：${ignoredNonPerformanceFiles}`
      : ignoredFiles
        ? `PR 仅修改版本号或内部包发布范围等发版元数据：${ignoredFiles}`
        : 'PR 未修改性能相关源码、依赖或 demo'
    summary.performanceGuard = performanceRelevantChanges
      ? { ...performanceGuard, blocking: true, relevantChanges: performanceChanges.relevantFiles }
      : asInformationalPerformanceGuard(performanceGuard, informationalReason)
    process.stdout.write(`[benchmark] performance guard mode: ${performanceRelevantChanges ? 'blocking' : 'informational'}\n`)
    process.stdout.write(`[benchmark] performance relevant files: ${relevantFiles || 'none'}\n`)
    process.stdout.write(`[benchmark] ignored release metadata files: ${ignoredFiles || 'none'}\n`)
    process.stdout.write(`[benchmark] ignored non-performance files: ${ignoredNonPerformanceFiles || 'none'}\n`)
  }
  const markdown = toMarkdown(summary, baselineRef || baseline)
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  await fs.writeFile(reportPath, markdown, 'utf8')
  await appendStepSummary(reportPath)
  process.stdout.write(`[benchmark] report -> ${reportPath}\n`)
  process.stdout.write(`[benchmark] summary -> ${summaryPath}\n`)

  if (summary.currentOnlyErrors.length > 0 && !process.argv.includes('--allow-errors')) {
    for (const item of summary.currentOnlyErrors) {
      console.error(`[benchmark] current-only failure: ${item.key}\n${item.error}`)
    }
    throw new Error(`benchmark current matrix has ${summary.currentOnlyErrors.length} current-only failed row(s)`)
  }
  if (summary.performanceGuard && !summary.performanceGuard.passed && !process.argv.includes('--allow-regressions')) {
    for (const violation of summary.performanceGuard.violations) {
      console.error(`[benchmark] performance guard violation: ${JSON.stringify(violation)}`)
    }
    throw new Error(`performance guard detected ${summary.performanceGuard.violations.length} regression(s)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
