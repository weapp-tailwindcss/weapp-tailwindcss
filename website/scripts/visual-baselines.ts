import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'
import { captureCandidates } from './visual-baselines/capture'
import { installCandidates, reviewCandidates, verifyInstalledBaselines } from './visual-baselines/install'

async function main() {
  const { positionals, values } = parseArgs({ options: {
    directory: { type: 'string' },
    reviewer: { type: 'string' },
    notes: { type: 'string' },
    evidence: { type: 'string', multiple: true },
  }, allowPositionals: true })
  const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
  const [action] = positionals
  if (action === 'verify') {
    await verifyInstalledBaselines(websiteRoot)
    return
  }
  if (positionals.length !== 1 || !values.directory) {
    throw new Error('用法：visual-baselines <capture|review|install> --directory <全新候选目录>；review 还需 --reviewer、--notes 和 --evidence <PNG>')
  }
  const directory = path.resolve(values.directory)
  if (action === 'capture') {
    await captureCandidates(directory, websiteRoot)
  }
  else if (action === 'review') {
    await reviewCandidates(directory, websiteRoot, values.reviewer ?? '', values.notes ?? '', (values.evidence ?? []).map(file => path.resolve(file)))
  }
  else if (action === 'install') {
    await installCandidates(directory, websiteRoot)
  }
  else {
    throw new Error(`未知基线操作：${action}`)
  }
}

main().catch((error) => {
  console.error(formatWorkflowError(error))
  process.exitCode = 1
})
