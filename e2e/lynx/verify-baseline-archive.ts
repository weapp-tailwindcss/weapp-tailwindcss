import path from 'node:path'
import process from 'node:process'
import { validateNativeBaselineArchive } from './baseline-archive'

async function main() {
  const directory = process.argv[2]
  if (!directory || process.argv.length !== 3) {
    throw new Error('Usage: tsx e2e/lynx/verify-baseline-archive.ts <archive-directory>')
  }
  const { index } = await validateNativeBaselineArchive(path.resolve(directory))
  process.stdout.write(`${JSON.stringify({ archive: path.relative(process.cwd(), directory), catalogHash: index.catalogHash, runs: Object.fromEntries(Object.entries(index.platforms).map(([platform, value]) => [platform, value.runId])), files: index.artifacts.length }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
