import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { packRuntimeDependencies } from '../../../../scripts/ci/pack-runtime-dependencies.mjs'
import { repo } from '../../../../scripts/ci/demo-matrix/catalog.mjs'
import { run } from '../../demo/process.mjs'

const { values } = parseArgs({ options: { 'out-dir': { type: 'string' }, source: { type: 'string' } } })
if (!values['out-dir'] || !values.source) throw new Error('需要 --out-dir 和描述源码身份的 --source；先构建运行时依赖闭包')
const output = path.resolve(values['out-dir'])
await mkdir(output, { recursive: true })
const overrides = await packRuntimeDependencies(repo, 'weapp-tailwindcss', output, output, async (args, cwd) => {
  await run('pnpm', args, { cwd, logFile: path.join(output, `${path.basename(cwd)}-pack.log`) })
})
const packages = Object.fromEntries(Object.entries(overrides).map(([name, spec]) => [name, path.resolve(output, spec.slice('file:'.length))]))
const { version } = JSON.parse(await readFile(path.join(repo, 'packages/weapp-tailwindcss/package.json'), 'utf8'))
await writeFile(path.join(output, 'artifacts.json'), JSON.stringify({ source: values.source, version, packages }, null, 2))
console.log(path.join(output, 'artifacts.json'))
