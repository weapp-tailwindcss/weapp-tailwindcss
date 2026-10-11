import process from 'node:process'
import { createCoverageArtifact } from '../e2e/coverageArtifacts'

async function main() {
  const file = process.argv[2]
  if (!file) {
    throw new Error('artifact path is required')
  }
  const kind = (process.argv[3] ?? 'other') as Parameters<typeof createCoverageArtifact>[2]
  const artifact = await createCoverageArtifact(process.cwd(), file, kind)
  process.stdout.write(`${JSON.stringify(artifact)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
