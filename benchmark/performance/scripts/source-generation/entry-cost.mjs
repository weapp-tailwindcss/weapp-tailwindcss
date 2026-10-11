import assert from 'node:assert/strict'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { stringify } from 'yaml'
import { repo } from '../../../../scripts/ci/demo-matrix/catalog.mjs'
import { diskBytes } from '../../demo/install.mjs'
import { run } from '../../demo/process.mjs'
import { parseLock } from '../../demo/published.mjs'
import { entries, entryMarkdown, summarizeEntries } from './entry-report.mjs'
import { assertSameRegistryDependencies } from './identity.mjs'

const { values } = parseArgs({ options: {
  'before': { type: 'string' },
  'after': { type: 'string' },
  'out-dir': { type: 'string' },
  'registry': { type: 'string', default: 'https://registry.npmjs.org/' },
  'dependency-changes': { type: 'string' },
  'profile': { type: 'boolean' },
} })
assert.ok(values.before && values.after && values['out-dir'], '需要两份 tarball 清单及输出目录')
const output = path.resolve(values['out-dir'])
await mkdir(output, { recursive: true })
const root = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'))
const sourceLock = parseLock(await readFile(path.join(repo, 'pnpm-lock.yaml'), 'utf8'))
const artifacts = Object.fromEntries(await Promise.all(['before', 'after'].map(async variant => [variant, JSON.parse(await readFile(values[variant], 'utf8'))])))
const report = { schema: 'weapp-source-entry-cost/v1', scope: '独立最小消费项目；源码 tarball，非 demo 端到端或 npm 下载测速', registry: values.registry, artifacts, environment: { node: process.version, packageManager: root.packageManager, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model }, preparation: {}, samples: [], errors: [] }
const checkpoint = () => writeFile(path.join(output, values.profile ? 'profile.json' : 'report.json'), JSON.stringify(report, null, 2))
report.profile = Boolean(values.profile)
const projects = {}
const locks = {}
try {
  for (const variant of ['before', 'after']) {
    const project = path.join(output, variant)
    projects[variant] = project
    await mkdir(project, { recursive: true })
    await cp(fileURLToPath(new URL('./entry-worker.mjs', import.meta.url)), path.join(project, 'entry-worker.mjs'))
    const packed = artifacts[variant]
    const dependencies = Object.fromEntries(['weapp-tailwindcss', '@weapp-tailwindcss/postcss'].map(name => [name, `file:${packed.packages[name]}`]))
    dependencies.tailwindcss = sourceLock.importers['.'].devDependencies.tailwindcss.version.split('(')[0]
    await writeFile(path.join(project, 'package.json'), JSON.stringify({ name: `entry-cost-${variant}`, private: true, type: 'module', packageManager: root.packageManager, dependencies }, null, 2))
    await writeFile(path.join(project, 'pnpm-workspace.yaml'), stringify({ packages: ['.'], autoInstallPeers: false, allowBuilds: { '@tailwindcss/oxide': true }, overrides: Object.fromEntries(Object.entries(packed.packages).map(([name, file]) => [name, `file:${file}`])) }))
    const store = path.join(project, 'store')
    await run('pnpm', ['install', '--no-frozen-lockfile', '--registry', values.registry, '--store-dir', store], { cwd: project, logFile: path.join(project, 'prepare.log'), timeout: 180_000 })
    locks[variant] = parseLock(await readFile(path.join(project, 'pnpm-lock.yaml'), 'utf8'))
    report.preparation[variant] = { packageCount: Object.keys(locks[variant].packages).length, installedBytes: await diskBytes(path.join(project, 'node_modules')), storeBytes: await diskBytes(store), packageInstances: (await readdir(path.join(project, 'node_modules', '.pnpm'))).filter(name => name !== 'node_modules' && name !== 'lock.yaml').length }
    await checkpoint()
  }
  const changes = values['dependency-changes'] ? JSON.parse(await readFile(values['dependency-changes'], 'utf8')) : []
  const modes = lock => Object.fromEntries(['native', 'static', 'enabled'].map(mode => [mode, lock]))
  report.dependencyEvidence = assertSameRegistryDependencies(modes(locks.before), modes(locks.after), changes).enabled
  for (const [batch, order] of [['first', ['before', 'after']], ['second', ['after', 'before']]]) {
    if (values.profile && batch === 'second') {
      break
    }
    for (let round = 0; round < (values.profile ? 1 : 7); round++) {
      for (const variant of round % 2 ? [...order].reverse() : order) {
        const project = projects[variant]
        if (!values.profile) {
          await rm(path.join(project, 'node_modules'), { recursive: true, force: true })
          const sample = await run('pnpm', ['install', '--frozen-lockfile', '--offline', '--store-dir', path.join(project, 'store')], { cwd: project, logFile: path.join(project, `${batch}-${round}-install.log`), timeout: 60_000 })
          delete sample.stdout
          report.samples.push({ variant, batch, round, metric: 'install.offline', ...sample })
          await checkpoint()
        }
        for (const entry of entries) {
          for (const format of ['esm', 'cjs']) {
            const name = `${batch}-${round}-${format}-${entry.replaceAll('/', '_')}`
            const result = await run(process.execPath, [...(values.profile ? ['--cpu-prof', `--cpu-prof-dir=${project}`, `--cpu-prof-name=${name}.cpuprofile`] : []), path.join(project, 'entry-worker.mjs'), project, format, entry], { cwd: project, logFile: path.join(project, `${name}.log`), timeout: 60_000 })
            const sample = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
            report.samples.push({ variant, batch, round, metric: 'entry', ...sample, processMs: result.ms, peakRssMb: result.peakRssMb })
            await checkpoint()
          }
        }
      }
    }
  }
}
catch (error) {
  report.errors.push(error.stack)
  process.exitCode = 1
}
report.finishedAt = new Date().toISOString()
const summary = summarizeEntries(report)
report.rows = summary.rows
report.errors.push(...summary.errors)
if (report.errors.length) {
  process.exitCode = 1
}
await checkpoint()
await writeFile(path.join(output, values.profile ? 'profile.md' : 'report.md'), entryMarkdown(report, report.rows))
console.log(`${output}: ${report.samples.length} 个样本，${report.errors.length} 个错误`)
