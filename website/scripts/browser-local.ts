import type { LocalWorkerContext, LocalWorkerOptions } from './local-worker/server'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'
import { verifyWorkerRoutes } from './local-worker/assertions'
import { discoverBrowserBudget } from './local-worker/browser-budget'
import { runLocalCommand } from './local-worker/command'
import { withLocalWorker } from './local-worker/server'

export function localBrowserCommand(context: LocalWorkerContext) {
  const require = createRequire(pathToFileURL(path.join(context.websiteRoot, 'package.json')))
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '1', PLAYWRIGHT_BASE_URL: context.baseUrl.href, PLAYWRIGHT_HTML_OPEN: 'never' }
  return {
    command: process.execPath,
    args: [require.resolve('@playwright/test/cli'), 'test', '--config', path.join(context.websiteRoot, 'scripts', 'local-worker', 'playwright.config.mts'), '--project=chromium', '--project=firefox', '--project=webkit', '--update-snapshots=none'],
    cwd: context.websiteRoot,
    env,
    stdio: 'inherit' as const,
  }
}

export async function verifyBrowserLocal(options: Partial<LocalWorkerOptions> = {}) {
  const websiteRoot = options.websiteRoot ?? fileURLToPath(new URL('..', import.meta.url))
  await withLocalWorker(async (context) => {
    await verifyWorkerRoutes(context)
    const command = localBrowserCommand(context)
    const budget = await discoverBrowserBudget(command, context.signal)
    process.stdout.write(`[website-browser] command capacity: ${JSON.stringify(budget)}\n`)
    await runLocalCommand(command, context.signal, budget.timeoutMs)
  }, { ...options, websiteRoot })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBrowserLocal().catch((error) => {
    console.error(formatWorkflowError(error))
    process.exitCode = 1
  })
}
