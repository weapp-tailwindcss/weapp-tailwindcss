import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { buildCompatibilityBundle } from './build'
import { compatibilityDir } from './catalog'
import { analyzeStaticEvidence } from './static-evidence'

async function main() {
  const outputPath = path.join(compatibilityDir, 'static-evidence.json')
  const { encoderLog } = await buildCompatibilityBundle()
  const evidence = await analyzeStaticEvidence(new Date().toISOString(), encoderLog)
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  process.stdout.write(`已更新 ${path.relative(process.cwd(), outputPath)}，共 ${evidence.results.length} 个 case。\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
