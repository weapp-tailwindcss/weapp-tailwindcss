import type { RunContext } from './context'
import type { BrowserEngine, CapabilityReport } from './types'
import { chromium, firefox, webkit } from 'playwright'
import { authoringWebProfiles, runAuthoringWeb } from './authoring-web'
import { runHmr } from './hmr'
import { hmrContract } from './hmr/contract'
import { loadInventory } from './inventory'
import { selectCaseGroups } from './plan'
import { runRegistryWeb } from './registry-web'
import { assertCapabilitySuccess } from './report'
import { runWeb, webProbes } from './web'

/** 每个引擎复用本轮同一个后台浏览器；子 runner 只清理各自的 context。 */
export async function runWebSuite(context: RunContext, engine: BrowserEngine) {
  const inventory = await loadInventory()
  const groups = selectCaseGroups(context.caseFilter, {
    authored: webProbes.map(probe => `runtime/${probe.id}`),
    registry: inventory.utilities.map(item => `registry/${item.id}`),
    authoring: authoringWebProfiles.map(profile => profile.id),
    hmr: [hmrContract().id],
  })
  const browser = await { chromium, firefox, webkit }[engine].launch({ headless: true })
  const reports: CapabilityReport[] = []
  try {
    if (groups.authored) {
      reports.push(await runWeb(context, engine, browser))
    }
    if (groups.registry) {
      reports.push(await runRegistryWeb(context, engine, 20, browser))
    }
    if (groups.authoring) {
      reports.push(await runAuthoringWeb(context, engine, browser))
    }
    if (groups.hmr) {
      reports.push(await runHmr(context, engine, browser))
    }
  }
  finally {
    await browser.close()
  }
  for (const report of reports) {
    assertCapabilitySuccess(report)
  }
  return reports
}
