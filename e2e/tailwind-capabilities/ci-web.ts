import { randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { runAuthoringWeb } from './authoring-web'
import { fixtureBaseline } from './baseline'
import { runHmr } from './hmr'
import { runRegistryWeb } from './registry-web'
import { assertCapabilitySuccess } from './report'
import { browserEngines } from './types'
import { runWeb } from './web'

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('此入口仅用于普通 GitHub CI；本地验证请使用带 --preflight-report 的 pnpm e2e:tailwind')
}
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--engine' || !browserEngines.includes(args[1] as typeof browserEngines[number])) {
  throw new Error('用法：pnpm e2e:tailwind:web:ci --engine chromium|firefox|webkit')
}
const engine = args[1] as typeof browserEngines[number]
const root = path.resolve(import.meta.dirname, '../..')
const runId = randomUUID()
async function main() {
  await fixtureBaseline(root)
  const context = { root, runId, directory: path.join(root, 'e2e', '.artifacts', 'tailwind', runId, `web-${engine}`), startedAt: new Date().toISOString() }
  const reports = [await runWeb(context, engine), await runRegistryWeb(context, engine), await runHmr(context, engine), await runAuthoringWeb(context, engine)]
  for (const report of reports) {
    assertCapabilitySuccess(report)
  }
}
main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
