import type { RunContext } from './context'
import type { BrowserEngine, CapabilityReport } from './types'
import { chromium, firefox, webkit } from 'playwright'
import { authoringWebProfiles, runAuthoringWeb } from './authoring-web'
import { launchCapabilityBrowser } from './browser/launch'
import { frameworkSourceProfiles, runFrameworkSource } from './framework-source'
import { runHmr } from './hmr'
import { hmrContract } from './hmr/contract'
import { loadInventory } from './inventory'
import { selectCaseGroups } from './plan'
import { runRegistryWeb } from './registry-web'
import { assertCapabilitySuccess } from './report'
import { runWeb, webProbes } from './web'
import { autofillProbe } from './web-autofill/fixtures'
import { runAutofillWeb } from './web-autofill/run'
import { contextWebProbes } from './web-context/fixtures'
import { runContextWeb } from './web-context/run'
import { historyProbe } from './web-history/fixtures'
import { runHistoryWeb } from './web-history/run'
import { lifecycleWebProbes } from './web-lifecycle/fixtures'
import { runLifecycleWeb } from './web-lifecycle/run'
import { nativeMediaProbe } from './web-native-media/fixtures'
import { runNativeMediaWeb } from './web-native-media/run'

/** 普通分组复用一个后台 Browser；历史组独占串行临时 profile 以验证无历史恢复。 */
export async function runWebSuite(context: RunContext, engine: BrowserEngine) {
  const inventory = await loadInventory()
  const groups = selectCaseGroups(context.caseFilter, {
    authored: webProbes.map(probe => `runtime/${probe.id}`),
    registry: inventory.utilities.map(item => `registry/${item.id}`),
    authoring: authoringWebProfiles.map(profile => profile.id),
    hmr: [hmrContract().id],
    context: contextWebProbes.map(probe => `runtime/${probe.id}`),
    framework: frameworkSourceProfiles.map(profile => profile.id),
    nativeMedia: engine === 'chromium' ? [`runtime/${nativeMediaProbe.id}`] : [],
    autofill: engine === 'chromium' ? [`runtime/${autofillProbe.id}`] : [],
    history: [`runtime/${historyProbe.id}`],
    lifecycle: lifecycleWebProbes.map(probe => `runtime/${probe.id}`),
  })
  const browserType = { chromium, firefox, webkit }[engine]
  const browser = Object.entries(groups).some(([group, selected]) => group !== 'history' && selected) ? await launchCapabilityBrowser(engine) : undefined
  const reports: CapabilityReport[] = []
  const errors: Error[] = []
  const runners: Array<{ group: keyof typeof groups, run: () => Promise<CapabilityReport> }> = [
    { group: 'authored', run: () => runWeb(context, engine, browser!) },
    { group: 'registry', run: () => runRegistryWeb(context, engine, 20, browser!) },
    { group: 'authoring', run: () => runAuthoringWeb(context, engine, browser!) },
    { group: 'hmr', run: () => runHmr(context, engine, browser!) },
    { group: 'context', run: () => runContextWeb(context, engine, browser!) },
    { group: 'framework', run: () => runFrameworkSource(context, engine, browser!) },
    { group: 'nativeMedia', run: () => runNativeMediaWeb(context, engine, browser!) },
    { group: 'autofill', run: () => runAutofillWeb(context, engine, browser!) },
    { group: 'lifecycle', run: () => runLifecycleWeb(context, engine, browser!) },
    { group: 'history', run: () => runHistoryWeb(context, engine, browserType) },
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
      await browser?.close()
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
