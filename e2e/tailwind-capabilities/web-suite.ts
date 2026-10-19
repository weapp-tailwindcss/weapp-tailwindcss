import type { RunContext } from './context'
import type { BrowserEngine, CapabilityReport } from './types'
import { chromium, firefox, webkit } from 'playwright'
import { authoringWebProfiles, runAuthoringWeb } from './authoring-web'
import { frameworkSourceProfiles, runFrameworkSource } from './framework-source'
import { runHmr } from './hmr'
import { hmrContract } from './hmr/contract'
import { loadInventory } from './inventory'
import { selectCaseGroups } from './plan'
import { runRegistryWeb } from './registry-web'
import { assertCapabilitySuccess } from './report'
import { runWeb, webProbes } from './web'
import { contextWebProbes } from './web-context/fixtures'
import { runContextWeb } from './web-context/run'

/** 每个引擎复用本轮同一个后台浏览器；子 runner 只清理各自的 context。 */
export async function runWebSuite(context: RunContext, engine: BrowserEngine) {
  const inventory = await loadInventory()
  const groups = selectCaseGroups(context.caseFilter, {
    authored: webProbes.map(probe => `runtime/${probe.id}`),
    registry: inventory.utilities.map(item => `registry/${item.id}`),
    authoring: authoringWebProfiles.map(profile => profile.id),
    hmr: [hmrContract().id],
    context: contextWebProbes.map(probe => `runtime/${probe.id}`),
    framework: frameworkSourceProfiles.map(profile => profile.id),
  })
  const browser = await { chromium, firefox, webkit }[engine].launch({ headless: true })
  const reports: CapabilityReport[] = []
  const errors: Error[] = []
  const runners: Array<{ group: keyof typeof groups, run: () => Promise<CapabilityReport> }> = [
    { group: 'authored', run: () => runWeb(context, engine, browser) },
    { group: 'registry', run: () => runRegistryWeb(context, engine, 20, browser) },
    { group: 'authoring', run: () => runAuthoringWeb(context, engine, browser) },
    { group: 'hmr', run: () => runHmr(context, engine, browser) },
    { group: 'context', run: () => runContextWeb(context, engine, browser) },
    { group: 'framework', run: () => runFrameworkSource(context, engine, browser) },
  ]
  try {
    for (const { group, run } of runners) {
      if (!groups[group]) {
        continue
      }
      try {
        const report = await run()
        reports.push(report)
        assertCapabilitySuccess(report)
      }
      catch (error) {
        errors.push(new Error(`Web ${engine} ${group}: ${String(error)}`, { cause: error }))
      }
    }
  }
  finally {
    try {
      await browser.close()
    }
    catch (error) {
      errors.push(new Error(`Web ${engine} cleanup: ${String(error)}`, { cause: error }))
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map(error => error.message).join('\n'))
  }
  return reports
}
