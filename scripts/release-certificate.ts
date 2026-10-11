import type { CoverageReport } from '../e2e/coverageReport'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { collectCoverageIdentity } from '../e2e/coverageIdentity'
import { validateReleaseCertificate, verifyCoverageArtifacts } from '../e2e/coverageReport'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const reportPath = argument('--report') ?? process.env['RELEASE_CERTIFICATE_PATH']
  if (!reportPath) {
    throw new Error('release certificate path is required: use --report or RELEASE_CERTIFICATE_PATH')
  }
  const report = JSON.parse(await fs.readFile(path.resolve(reportPath), 'utf8')) as CoverageReport
  const identity = await collectCoverageIdentity(process.cwd())
  validateReleaseCertificate(report, identity)
  await verifyCoverageArtifacts(report, process.cwd())
  process.stdout.write(`[release-certificate] verified ${report.identity?.commitSha}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
