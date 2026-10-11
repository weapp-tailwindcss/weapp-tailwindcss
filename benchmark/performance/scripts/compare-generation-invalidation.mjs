import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'
import { difference } from '../demo/model.mjs'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const { values } = parseArgs({ options: { 'base-ref': { type: 'string', default: 'origin/main' }, 'out-dir': { type: 'string', default: '.tmp/generation-invalidation' } } })
const relative = 'packages/weapp-tailwindcss/src/compiler/tailwind-generation-session-pool.ts'
const entry = path.resolve(repo, relative)
const sha = execFileSync('git', ['rev-parse', values['base-ref']], { cwd: repo, encoding: 'utf8' }).trim()
const base = execFileSync('git', ['show', `${sha}:${relative}`], { cwd: repo, encoding: 'utf8' })
const reportDirectory = path.resolve(values['out-dir'])
const artifacts = path.resolve(repo, 'packages/weapp-tailwindcss/.tmp')
await mkdir(artifacts, { recursive: true })
await mkdir(reportDirectory, { recursive: true })
const directory = await mkdtemp(path.join(artifacts, 'generation-invalidation-'))
const bundles = {}
// 只替换被测会话池源码；其余生成器、引擎和工具链在两组之间完全相同。
for (const variant of ['before', 'after']) {
  bundles[variant] = path.join(directory, `${variant}.mjs`)
  await build({
    entryPoints: [entry], outfile: bundles[variant], bundle: true, platform: 'node', format: 'esm', packages: 'external',
    tsconfigRaw: { compilerOptions: { baseUrl: repo, paths: { '@/*': ['packages/weapp-tailwindcss/src/*'] } } },
    plugins: [{ name: 'pool-baseline', setup(api) {
      api.onLoad({ filter: /tailwind-generation-session-pool\.ts$/ }, async args => ({
        contents: variant === 'before' ? base : await readFile(args.path, 'utf8'), loader: 'ts', resolveDir: path.dirname(entry),
      }))
    } }],
  })
}
const worker = path.resolve(repo, 'benchmark/performance/scripts/generation-invalidation.mjs')
const rows = []
for (const [batch, order] of [['first', ['before', 'after']], ['second', ['after', 'before']]]) {
  const reports = {}
  for (const variant of order) {
    const output = path.join(reportDirectory, `${batch}-${variant}.json`)
    execFileSync(process.execPath, [worker, '--module', bundles[variant], '--out', output], { cwd: repo, stdio: 'inherit' })
    reports[variant] = JSON.parse(await readFile(output, 'utf8'))
  }
  for (const before of reports.before.rows) {
    const after = reports.after.rows.find(row => row.count === before.count)
    assert.deepEqual(after.samples.map(sample => sample.hashes), before.samples.map(sample => sample.hashes), '前后输出不等价')
    rows.push({ batch, sessions: before.count, before: before.statistics, after: after.statistics, difference: difference(before.statistics.median, after.statistics.median), beforeProcessPeakRssMb: reports.before.processPeakRssMb, afterProcessPeakRssMb: reports.after.processPeakRssMb })
  }
}
// Profile 在正式样本之后独立采集，不参与耗时汇总。
for (const variant of ['before', 'after']) {
  execFileSync(process.execPath, [worker, '--module', bundles[variant], '--out', path.join(reportDirectory, `profile-${variant}.json`), '--profile'], { cwd: repo, stdio: 'inherit' })
}
const sourceHash = createHash('sha256').update(await readFile(entry)).digest('hex')
const report = { schema: 'weapp-generation-invalidation-comparison/v1', baselineSha: sha, sourceHash, scope: '仅生成会话池；两组共用当前已构建依赖，不代表完整版本或 demo HMR', bundles, rows }
await writeFile(path.join(reportDirectory, 'comparison.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`对照报告：${path.join(reportDirectory, 'comparison.json')}`)
