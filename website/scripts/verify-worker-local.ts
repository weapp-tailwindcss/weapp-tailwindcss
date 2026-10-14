import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'
import { verifyWorkerRoutes } from './local-worker/assertions'
import { withLocalWorker } from './local-worker/server'

export async function verifyWorkerLocal() {
  const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
  await withLocalWorker(verifyWorkerRoutes, { websiteRoot })
  console.log('[website] Wrangler local 200/301/404/cache verification passed')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyWorkerLocal().catch((error) => {
    console.error(formatWorkflowError(error))
    process.exitCode = 1
  })
}
