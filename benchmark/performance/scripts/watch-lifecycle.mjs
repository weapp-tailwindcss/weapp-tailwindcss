import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { measureWatchLifecycle } from '../src/watch-lifecycle.mjs'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}
const sourceRoot = path.resolve(arg('--source-root', fileURLToPath(new URL('../../..', import.meta.url))))
const warmups = Number(arg('--warmups', 2))
const runs = Number(arg('--runs', 7))
const kinds = arg('--bundlers', 'vite,webpack').split(',')
const sizes = arg('--sizes', '10,50,100').split(',').map(Number)
if (!Number.isInteger(warmups) || warmups < 0 || !Number.isInteger(runs) || runs < 1 || kinds.some(kind => !['vite', 'webpack'].includes(kind)) || sizes.some(size => !Number.isInteger(size) || size < 1)) {
  throw new Error('无效的采样配置')
}
const updateStatic = process.argv.includes('--update-static')
if (updateStatic && (sizes.length !== 1 || sizes[0] !== 3)) {
  throw new Error('静态基线只接受 --sizes 3')
}
const output = path.resolve(arg('--output', path.join(sourceRoot, '.tmp', 'watch-lifecycle.json')))
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8' }).trim()),
  environment: { node: process.version, platform: process.platform, cpu: os.cpus()[0]?.model },
  cases: [],
}
try {
  for (const kind of kinds) {
    for (const size of sizes) {
      console.log(`[watch-lifecycle] ${kind} size=${size}`)
      const result = await measureWatchLifecycle({ sourceRoot, kind, size, warmups, runs })
      report.cases.push(result)
      if (updateStatic) {
        const directory = fileURLToPath(new URL('../test/fixtures/watch', import.meta.url))
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(path.join(directory, `${kind}.css`), result.outputCss)
      }
    }
  }
}
finally {
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
}
