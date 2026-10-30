import type { TypographyRect } from './skyline-typography/contract'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it, vi } from 'vitest'
import { captureMiniProgramScreenshot } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { existingWechatService } from '../scripts/wechat/service'
import { assertTypographyPhase } from './skyline-typography/assertions'
import { typographyIds, typographyPhases, typographySelector } from './skyline-typography/contract'

const repository = fileURLToPath(new URL('..', import.meta.url))
const demo = path.join(repository, 'demo', 'uni-app-vite-tailwindcss-v4')
const project = path.join(demo, 'dist', 'skyline-typography', 'build', 'mp-weixin')
it.runIf(process.env.E2E_IDE === '1')('真实插件构建在 Skyline / WebView 的组件边界内保留字体覆盖与 fallback', async () => {
  const artifacts = path.join(repository, 'e2e', '.artifacts', 'skyline-typography', randomUUID())
  await mkdir(artifacts, { recursive: true })
  const save = (name: string, data: unknown) => writeFile(path.join(artifacts, name), `${JSON.stringify(data, null, 2)}\n`)
  const buildMarker = randomUUID()
  const build = await execa('pnpm', ['run', 'skyline-typography:build'], { cwd: demo, env: { ...process.env, UNI_BUILD_STRICT: '1', NODE_ENV: 'production', SKYLINE_PROBE_BUILD: buildMarker } })
  await writeFile(path.join(artifacts, 'build.log'), build.all ?? `${build.stdout}\n${build.stderr}`)
  const cssFiles = (await readdir(project, { recursive: true })).filter(name => name.endsWith('.wxss')).sort()
  const cssHashes = await Promise.all(cssFiles.map(async asset => ({ asset, sha256: createHash('sha256').update(await readFile(path.join(project, asset))).digest('hex') })))
  await save('inputs.json', { buildMarker, project, driver: 'App-Service 调用真实组件公开 action，与源码按钮共用；不改写构建产物', phases: typographyPhases, cssHashes })
  const service = await existingWechatService()
  const records: unknown[] = []
  let mini: Awaited<ReturnType<Launcher['launch']>> | undefined
  let failure: unknown
  let checkpoint = 'launch'
  try {
    mini = await new Launcher().launch({ cliPath: service.command, projectPath: project, runtimeProvider: 'devtools', timeout: 90_000 })
    await save('environment.json', { service, system: await mini.systemInfo(), tool: await mini.toolInfo(), project, buildMarker })
    for (const renderer of ['skyline', 'webview']) {
      const page = await mini.reLaunch(`/pages/skyline-typography/${renderer}`)
      await page.waitForRendered({ selector: typographySelector('probe-marker'), timeout: 15_000 })
      const identity = await mini.evaluate('function(){var pages=getCurrentPages();var p=pages[pages.length-1];return {route:p.route,renderer:p.renderer}}')
      expect(identity.renderer).toBe(renderer)
      expect(identity.route).toBe(`pages/skyline-typography/${renderer}`)
      await page.waitForRendered({ selector: typographySelector('probe-build'), dataset: { build: buildMarker }, timeout: 10_000 })
      const measure = async () => {
        const observations: TypographyRect[] = await mini!.evaluate(`function(selectors){return new Promise(function(resolve){
          var query=wx.createSelectorQuery();
          selectors.forEach(function(selector){query.select(selector).fields({id:true,rect:true,size:true,computedStyle:['line-height','font-weight']});});
          query.exec(resolve);
        });}`, typographyIds.map(typographySelector))
        observations.forEach((rect, i) => {
          expect(rect?.id).toBe(typographyIds[i])
          expect(rect.width).toBeGreaterThan(0)
          expect(rect.height).toBeGreaterThan(0)
        })
        return Object.fromEntries(observations.map(rect => [rect.id, rect]))
      }
      for (const phase of typographyPhases) {
        checkpoint = `${renderer}-${phase.name}`
        if (phase.button) {
          const actions: Record<string, string> = { 'probe-inline': 'toggleInline', 'probe-utility-toggle': 'toggleUtility', 'probe-theme': 'toggleTheme', 'probe-reset': 'reset' }
          await mini.evaluate(`function(method){
            var pages=getCurrentPages();var component=pages[pages.length-1].selectComponent('.skyline-probe');
            if(!component || !component.$vm || typeof component.$vm[method] !== 'function')throw new Error('未取得真实组件 action: '+method);
            component.$vm[method]();
          }`, actions[phase.button])
        }
        await page.waitForRendered({ selector: typographySelector('probe-phase'), dataset: { phase: phase.value }, timeout: 10_000 })
        const record = { renderer, identity, phase: phase.name, phaseValue: phase.value, measured: {} as Record<string, TypographyRect> }
        records.push(record)
        // 父组件标识先于子组件属性渲染完成时，等待真实布局满足同一阶段的全部断言。
        await vi.waitFor(async () => {
          record.measured = await measure()
          assertTypographyPhase(record.measured, phase, renderer)
        }, { timeout: 10_000, interval: 100 })
        await save('evidence.json', records)
        if (['default', 'theme-clear', 'reset'].includes(phase.name)) {
          await captureMiniProgramScreenshot(mini, path.join(artifacts, `${checkpoint}.png`), 10_000)
        }
      }
    }
  }
  catch (error) {
    failure = error
    await save('failure.json', { error: String(error), checkpoint, records })
  }
  finally {
    if (mini) {
      try {
        await closeWechatProject(project, mini)
        await save('cleanup.json', { closed: true, project })
      }
      catch (error) {
        await save('cleanup.json', { closed: false, project, error: String(error) })
        failure = failure ? new AggregateError([failure, error], '字体复验与项目清理失败') : error
      }
    }
    console.log(`Skyline typography evidence: ${artifacts}`)
  }
  if (failure) {
    throw failure
  }
}, 480_000)
