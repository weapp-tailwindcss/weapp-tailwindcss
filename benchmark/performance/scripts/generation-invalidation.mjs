import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { Session } from 'node:inspector/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { statistics } from '../demo/model.mjs'

// 单独测生成会话失效，不冒充 demo 的保存到页面耗时。
const { values } = parseArgs({ options: {
  module: { type: 'string' },
  out: { type: 'string' },
  profile: { type: 'boolean', default: false },
} })
assert.ok(values.module && values.out, '需要 --module 打包入口和 --out 报告路径')
const moduleFile = path.resolve(values.module)
const output = path.resolve(values.out)
const { TailwindGenerationSessionPool } = await import(pathToFileURL(moduleFile).href)
const hash = content => createHash('sha256').update(content).digest('hex')
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'weapp-generation-invalidation-')))
const inspector = new Session()
const report = {
  schema: 'weapp-generation-invalidation/v1',
  boundary: 'invalidate-and-regenerate-all-entries',
  artifactSha256: hash(await readFile(moduleFile)),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  settings: { warmups: 2, runs: 20, profile: values.profile, sizes: [2, 8, 24] },
  rows: [],
}
try {
  await mkdir(path.dirname(output), { recursive: true })
  if (values.profile) {
    inspector.connect()
    await inspector.post('Profiler.enable')
    await inspector.post('Profiler.start')
  }
  for (const count of report.settings.sizes) {
    const pool = new TailwindGenerationSessionPool()
    try {
      const sources = []
      for (let index = 0; index < count; index++) {
        const config = path.join(directory, `theme-${index}.cjs`)
        await writeFile(config, 'module.exports = { theme: { colors: { probe: "#123456" } } }')
        sources.push({ projectRoot: process.cwd(), base: directory, baseFallbacks: [process.cwd()], css: `@config "./theme-${index}.cjs"; @tailwind utilities;`, dependencies: [config] })
      }
      const generate = async () => {
        const hashes = []
        for (const source of sources) {
          const result = await pool.generate(source, { candidates: ['bg-probe'], scanSources: false, incrementalCache: true, target: 'web' })
          assert.ok(result.classSet.has('bg-probe'), '生成结果必须包含实际消费的类名')
          assert.ok(result.css.includes('#123456'), '必须生成配置指定的实际样式')
          hashes.push(hash(result.css))
        }
        return hashes
      }
      const expected = await generate()
      const samples = []
      for (let round = -report.settings.warmups; round < report.settings.runs; round++) {
        const began = performance.now()
        pool.invalidate({ type: 'dependencies', paths: [sources[0].dependencies[0]] })
        const retainedSessions = pool.size
        const hashes = await generate()
        const ms = performance.now() - began
        assert.deepEqual(hashes, expected, '失效重建不能改变任何入口的输出')
        if (round >= 0) samples.push({ ms, retainedSessions, hashes })
      }
      report.rows.push({ count, samples, statistics: statistics(samples.map(sample => sample.ms)) })
    }
    finally { pool.dispose() }
  }
  report.processPeakRssMb = process.resourceUsage().maxRSS / 1024
  if (values.profile) {
    const { profile } = await inspector.post('Profiler.stop')
    await writeFile(`${output}.cpuprofile`, JSON.stringify(profile))
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report.rows.map(row => ({ sessions: row.count, ...row.statistics }))))
}
finally {
  if (values.profile) inspector.disconnect()
  await rm(directory, { recursive: true, force: true })
}
