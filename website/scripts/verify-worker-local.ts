import type { DeploymentTarget } from '../config/deploymentTarget'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'
import { getExpectedHashedAssets, verifyDeploymentAssets } from './deployment-verification'
import { parseDeploymentVerificationOptions } from './deployment-verification-options'
import { verifyWorkerRoutes } from './local-worker/assertions'
import { withLocalWorker } from './local-worker/server'

export async function verifyWorkerLocal(target: DeploymentTarget = 'production') {
  const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
  const assets = await getExpectedHashedAssets()
  await withLocalWorker(async (context) => {
    await verifyWorkerRoutes(context)
    const options = parseDeploymentVerificationOptions([context.baseUrl.href, '--target', target])
    await verifyDeploymentAssets(options, assets, context.signal)
  }, { websiteRoot, target })
  console.log(`[website] Wrangler local ${target} bilingual/metadata/indexing/routes/cache/hash verification passed`)
}

async function main() {
  const args = process.argv.slice(2).filter(argument => argument !== '--')
  const options = parseDeploymentVerificationOptions(['http://127.0.0.1', ...(args.length ? args : ['--target', 'production'])])
  await verifyWorkerLocal(options.target)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(formatWorkflowError(error))
    process.exitCode = 1
  })
}
