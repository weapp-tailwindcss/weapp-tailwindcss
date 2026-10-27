import { appendFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createNightlyPlan, releaseNightly } from 'repoctl'
import configuration from '../../repoctl.config.ts'
import { prepareNativeSource } from './native-inputs.mjs'
import { resolveNightlyRoute } from './route.mjs'

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const plan = process.argv.includes('--plan')
const env = process.env
resolveNightlyRoute(env, JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8')))
if (!env.RUNNER_TEMP) {
  throw new Error('Nightly requires RUNNER_TEMP for retained reports outside the checkout')
}
const report = await (plan ? createNightlyPlan : releaseNightly)({
  cwd,
  config: configuration.commands.release,
  outputDirectory: path.join(env.RUNNER_TEMP, 'repoctl-nightly'),
  referenceGitlinks: ['submodules/tailwindcss-v3', 'submodules/tailwindcss-v4'],
  ...(!plan && {
    publish: true,
    prepareSource: context => prepareNativeSource(context, path.join(cwd, 'packages')),
  }),
})
await writeFile(path.join(env.RUNNER_TEMP, 'nightly-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (plan && env.GITHUB_OUTPUT) {
  await appendFile(env.GITHUB_OUTPUT, `run=${report.status === 'planned'}\n`)
}
if (report.status === 'failed') {
  throw new Error(report.error ?? 'Nightly failed; inspect the retained report')
}
