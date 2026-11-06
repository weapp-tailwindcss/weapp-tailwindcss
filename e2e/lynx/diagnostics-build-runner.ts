import fs from 'node:fs/promises'
import process from 'node:process'
import { inspect } from 'node:util'
import { buildDiagnosticsFixture } from './diagnostics-build-fixture'

async function main() {
  const [strict, mode, output, directory] = process.argv.slice(2)
  if ((strict !== 'true' && strict !== 'false') || (mode !== 'development' && mode !== 'production') || !output || !directory) {
    throw new Error('诊断夹具参数不完整')
  }
  await fs.mkdir(directory)
  const result = await buildDiagnosticsFixture(directory, strict === 'true', mode)
  await fs.writeFile(output, JSON.stringify({
    ...result,
    inputs: [...result.inputs],
    bundle: [...result.bundle],
    outputs: result.outputs.map(entry => ({ ...entry, bundle: [...entry.bundle] })),
  }))
}

main().catch((error) => {
  process.stderr.write(`${inspect(error)}\n`)
  process.exitCode = 1
})
