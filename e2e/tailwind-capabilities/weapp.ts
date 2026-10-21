import type { RunContext } from './context'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { resolveWechatAppId } from '../../scripts/wechat-app-id'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { Launcher } from '../../scripts/wechat/automator'
import { newReport, persistReport } from './context'
import { EnvironmentBlockedError, findEnvironmentBlock } from './environment-block'
import { withGeneratorFixture } from './fixture'
import { digest } from './identity'
import { loadInventory } from './inventory'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts, writeCapabilityReport } from './report'
import { weappFixtureCss } from './weapp/alpha-fixtures'
import { captureWeappProbe } from './weapp/capture'
import { weappContract } from './weapp/contract'
import { weappCoverageGaps } from './weapp/coverage'
import { weappProbes } from './weapp/fixtures'
import { weappProjectFiles, weappRuntimeFixture } from './weapp/render'

export async function runWeapp(context: RunContext) {
  const env = context.env
  const probes = weappProbes.filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const contracts = probes.map(weappContract)
  const gaps = context.caseFilter ? [] : weappCoverageGaps(await loadInventory(), contracts)
  contracts.push(...gaps)
  const report = await newReport(context, 'weapp', contracts, weappRuntimeFixture(probes), { provider: 'devtools', appid: resolveWechatAppId(env), httpPort: env?.['E2E_PREFLIGHT_WECHAT_HTTP_PORT'] ?? '', scopeGaps: gaps.length })
  for (const gap of gaps) {
    report.results.push({ id: gap.id, support: 'supported', status: 'not-run', reason: '尚无此注册能力的独立微信运行时语义夹具，构建结果不能替代。', assertions: [], artifacts: [], warnings: [] })
  }
  const project = path.join(context.directory, 'project')
  let mini: Awaited<ReturnType<Launcher['launch']>> | undefined
  await runWithCleanup(async () => {
    try {
      await mkdir(path.join(project, 'pages', 'index'), { recursive: true })
      const generated = await withGeneratorFixture(context.root, weappFixtureCss, {}, generator => generator.generate({ target: 'weapp', candidates: probes.flatMap(item => [...item.candidates]), scanSources: false }))
      const files = weappProjectFiles(generated.css, context.runId, resolveWechatAppId(env))
      const shared: string[] = []
      const owners = probes.map(probe => probe.id)
      for (const [name, content] of Object.entries(files)) {
        // 此处的键是受控的产物逻辑名，按段转为当前平台的文件系统路径。
        const file = path.join(project, ...name.split('/'))
        await writeFile(file, content)
        const entry = await receipt(file, context.directory, context.runId, owners, 'bundle')
        report.artifacts.push(entry)
        shared.push(entry.path)
      }
      const cssFile = path.join(context.directory, 'generated.wxss')
      await writeFile(cssFile, generated.css)
      report.artifacts.push(await receipt(cssFile, context.directory, context.runId, owners, 'css'))
      shared.push(path.relative(context.directory, cssFile))
      mini = await new Launcher().launch({ ...(env?.['E2E_PREFLIGHT_WECHAT_CLI'] ? { cliPath: env['E2E_PREFLIGHT_WECHAT_CLI'] } : {}), projectPath: project, timeout: 90_000 })
      const page = await mini.reLaunch('/pages/index/index')
      for (const probe of probes) {
        const contract = weappContract(probe)
        try {
          const captured = await captureWeappProbe(context, report, mini, page, probe, digest(generated.css))
          const passed = captured.assertions.every(assertionPassed)
          report.results.push({ id: probe.id, support: contract.expectation.support, status: passed ? 'passed' : 'failed', assertions: captured.assertions, artifacts: [...shared, ...captured.artifacts], warnings: [], ...(passed ? contract.expectation.reason ? { reason: contract.expectation.reason } : {} : { reason: `${probe.property} 的实际值、独立参考或截图证据不符` }) })
        }
        catch (error) {
          if (findEnvironmentBlock(error)) {
            throw error
          }
          report.results.push({ id: probe.id, status: 'failed', support: contract.expectation.support, reason: String(error), assertions: [], artifacts: report.artifacts.filter(item => item.caseIds.includes(probe.id)).map(item => item.path), warnings: [] })
        }
      }
    }
    catch (error) {
      const completed = new Set(report.results.map(item => item.id))
      const status = findEnvironmentBlock(error) ? 'blocked' : 'failed'
      for (const contract of contracts.filter(item => !completed.has(item.id))) {
        report.results.push({ id: contract.id, status, support: contract.expectation.support, reason: formatWorkflowError(error), assertions: [], artifacts: [], warnings: [] })
      }
      throw error
    }
  }, () => runWithCleanup(async () => {
    if (mini) {
      try {
        await closeWechatProject(project, mini, 10_000)
      }
      catch (error) {
        report.environment['cleanupError'] = String(error)
        throw new EnvironmentBlockedError('本轮微信项目清理未确认，保留原服务与登录态', { cause: error })
      }
    }
  }, () => writeCapabilityReport(path.join(context.directory, 'report.json'), report)))
  validateCapabilityReport(report, contracts, report.identity, context.runId, 'weapp')
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, contracts)
  return report
}
