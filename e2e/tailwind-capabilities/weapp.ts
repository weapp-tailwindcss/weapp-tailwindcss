import type { RunContext } from './context'
import type { SemanticAssertion } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { escape } from 'weapp-tailwindcss/escape'
import { captureMiniProgramViewport, readMiniProgramViewportMetrics } from '../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { resolveWechatAppId } from '../../scripts/wechat-app-id'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { Launcher } from '../../scripts/wechat/automator'
import { newReport, persistReport } from './context'
import { withGeneratorFixture } from './fixture'
import { loadInventory } from './inventory'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts, writeCapabilityReport } from './report'
import { weappContract, weappExpectedStyles, weappPhases, weappRuntimeAssertions } from './weapp/contract'
import { weappCoverageGaps } from './weapp/coverage'
import { weappProbes } from './weapp/fixtures'
import { sampleWeappPixel, weappPixelAssertions } from './weapp/pixels'

export async function runWeapp(context: RunContext) {
  const env = context.env
  const probes = weappProbes.filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const contracts = probes.map(weappContract)
  const gaps = context.caseFilter ? [] : weappCoverageGaps(await loadInventory(), contracts)
  contracts.push(...gaps)
  const report = await newReport(context, 'weapp', contracts, probes, { provider: 'devtools', appid: resolveWechatAppId(env), httpPort: env?.E2E_PREFLIGHT_WECHAT_HTTP_PORT ?? '', scopeGaps: gaps.length })
  for (const gap of gaps) {
    report.results.push({ id: gap.id, support: 'supported', status: 'not-run', reason: '尚无此注册能力的独立微信运行时语义夹具，构建结果不能替代。', assertions: [], artifacts: [], warnings: [] })
  }
  const project = path.join(context.directory, 'project')
  let mini: Awaited<ReturnType<Launcher['launch']>> | undefined
  try {
    await mkdir(path.join(project, 'pages', 'index'), { recursive: true })
    const generated = await withGeneratorFixture(context.root, '@import "tailwindcss" source(none);', {}, generator => generator.generate({ target: 'weapp', candidates: probes.flatMap(item => [...item.candidates]), scanSources: false }))
    const fixtures = probes.map(item => ({ ...item, className: item.candidates.map(value => escape(value)).join(' '), reference: item.reference }))
    const files: Record<string, string> = {
      'project.config.json': JSON.stringify({ appid: resolveWechatAppId(env), compileType: 'miniprogram', miniprogramRoot: './', projectname: 'tailwind-capability-e2e', setting: { es6: true, postcss: false, minified: false } }),
      'app.js': 'App({})',
      'app.json': JSON.stringify({ pages: ['pages/index/index'], window: { navigationStyle: 'custom' } }),
      'app.wxss': `.base{display:block;box-sizing:border-box;min-height:32px;color:#111111;background-color:#eeeeee;font-size:16px;line-height:1.5}\n${generated.css}`,
      'pages/index/index.json': '{}',
      'pages/index/index.wxml': '<view class="frame"><text id="identity">{{runId}} {{probe.id}}</text><view class="slot"><text wx:if="{{probe.text}}" id="probe" class="base {{className}}" style="{{probe.inline}}">Tailwind 123</text><view wx:else id="probe" class="base {{className}}" style="{{probe.inline}}">Tailwind 123</view></view><view class="slot"><text wx:if="{{probe.text}}" id="reference" class="base" style="{{reference}}">Tailwind 123</text><view wx:else id="reference" class="base" style="{{reference}}">Tailwind 123</view></view><button id="toggle" bindtap="toggle">切换</button></view>',
      'pages/index/index.wxss': '.frame{padding:24px;--probe-width:73px}.slot{width:200px;min-height:100px;padding:10px 0}button{width:120px}',
      'pages/index/index.js': `Page({data:{runId:${JSON.stringify(context.runId)},probe:{},className:'',reference:''},toggle(){const on=!this.data.on;this.setData({on,className:on?${JSON.stringify(escape('w-[64px]'))}:${JSON.stringify(escape('w-[32px]'))},reference:on?'width:64px':'width:32px'})}})`,
    }
    for (const [name, content] of Object.entries(files)) {
    // 此处的键是受控的产物逻辑名，按段转为当前平台的文件系统路径。
      await writeFile(path.join(project, ...name.split('/')), content)
    }
    const cssFile = path.join(context.directory, 'generated.wxss')
    await writeFile(cssFile, generated.css)
    report.artifacts.push(await receipt(cssFile, context.directory, context.runId, contracts.map(item => item.id), 'css'))
    mini = await new Launcher().launch({ cliPath: env?.E2E_PREFLIGHT_WECHAT_CLI, projectPath: project, timeout: 90_000 })
    const page = await mini.reLaunch('/pages/index/index')
    for (const probe of fixtures) {
      try {
        const artifacts: string[] = ['generated.wxss']
        const assertions: SemanticAssertion[] = []
        await page.setData({ probe, className: ('dynamic' in probe && probe.dynamic) ? escape('w-[32px]') : probe.className, reference: probe.reference, on: false })
        const phases = weappPhases(probe)
        const measurements: unknown[] = []
        for (const phase of phases) {
          if (phase === 'after' || phase === 'restored') {
            await (await page.$('#toggle'))!.tap()
          }
          await page.waitFor(200)
          const node = (await page.$('#probe'))!
          const reference = (await page.$('#reference'))!
          if (!node || !reference) {
            throw new Error(`${probe.id} 未渲染目标与独立参考节点`)
          }
          const expected = weappExpectedStyles(probe, phase)
          const properties = Object.keys(expected)
          const actual = Object.fromEntries(await Promise.all(properties.map(async property => [property, await node.style(property)])))
          const referenceValues = Object.fromEntries(await Promise.all(properties.map(async property => [property, await reference.style(property)])))
          assertions.push(...weappRuntimeAssertions(probe, phase, actual, referenceValues))
          const screenshot = path.join(context.directory, `${probe.id}-${phase}.png`)
          const png = await captureMiniProgramViewport(mini, screenshot, 30_000)
          if ('pixel' in probe) {
            const viewport = await readMiniProgramViewportMetrics(mini, 10_000)
            const offset = await node.offset()
            const size = await node.size()
            const pixel = sampleWeappPixel(png, viewport.windowWidth, { ...offset, ...size })
            const referencePixel = sampleWeappPixel(png, viewport.windowWidth, { ...await reference.offset(), ...await reference.size() })
            assertions.push(...weappPixelAssertions(pixel, referencePixel, probe.pixel))
            measurements.push({ pixel, referencePixel, viewport })
            for (const [file, kind] of [[`${screenshot}.full.png`, 'screenshot'], [`${screenshot}.viewport.json`, 'measurements']] as const) {
              const raw = await receipt(file, context.directory, context.runId, [probe.id], kind)
              report.artifacts.push(raw)
              artifacts.push(raw.path)
            }
          }
          const image = await receipt(screenshot, context.directory, context.runId, [probe.id], 'screenshot')
          report.artifacts.push(image)
          artifacts.push(image.path)
          measurements.push({ phase, actual, expected, reference: referenceValues, offset: await node.offset(), size: await node.size() })
        }
        const file = path.join(context.directory, `${probe.id}.json`)
        await writeFile(file, JSON.stringify({ runId: context.runId, measurements }, null, 2))
        const measurement = await receipt(file, context.directory, context.runId, [probe.id], 'measurements')
        report.artifacts.push(measurement)
        artifacts.push(measurement.path)
        const passed = assertions.every(assertionPassed)
        report.results.push({ id: probe.id, support: 'supported', status: passed ? 'passed' : 'failed', assertions, artifacts, warnings: [], ...(!passed ? { reason: `${probe.property} 的实际值与独立参考不符` } : {}) })
      }
      catch (error) {
        report.results.push({ id: probe.id, status: 'failed', support: 'supported', reason: String(error), assertions: [], artifacts: [], warnings: [] })
      }
    }
  }
  catch (error) {
    const completed = new Set(report.results.map(item => item.id))
    for (const contract of contracts.filter(item => !completed.has(item.id))) {
      report.results.push({ id: contract.id, status: 'blocked', support: 'supported', reason: String(error), assertions: [], artifacts: [], warnings: [] })
    }
  }
  finally {
    if (mini) {
      try {
        await closeWechatProject(project, mini, 10_000)
      }
      catch (error) {
        report.environment.cleanupError = String(error)
        for (const result of report.results) {
          result.status = 'failed'
          result.reason = `本轮微信项目清理失败：${String(error)}`
        }
      }
    }
    await writeCapabilityReport(path.join(context.directory, 'report.json'), report)
  }
  validateCapabilityReport(report, contracts, report.identity, context.runId, 'weapp')
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, contracts)
  return report
}
