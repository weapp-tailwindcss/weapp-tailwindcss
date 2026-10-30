import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { captureMiniProgramScreenshot } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { existingWechatService } from '../scripts/wechat/service'

const repository = fileURLToPath(new URL('..', import.meta.url))
const demo = path.join(repository, 'demo', 'uni-app-vite-tailwindcss-v4')
const project = path.join(demo, 'dist', 'build', 'mp-weixin')
const ids = ['probe-original', 'probe-utility', 'probe-reference', 'probe-child', 'probe-weight-original', 'probe-weight', 'probe-weight-reference', 'probe-weight-regular', 'probe-normal', ...['missing', 'initial', 'empty', 'valid', 'cycle'].flatMap(reset => ['literal', 'nested'].map(fallback => `probe-${reset}-${fallback}`))]
const selector = (id: string) => `.skyline-probe >>> #${id}`

interface Rect {
  id: string
  width: number
  height: number
  [key: string]: unknown
}

it.runIf(process.env.E2E_IDE === '1')('复现 Skyline / WebView 的 initial 与字体 fallback 差异', async () => {
  const artifacts = path.join(repository, 'e2e', '.artifacts', 'skyline-typography', randomUUID())
  await mkdir(artifacts, { recursive: true })
  const save = (name: string, data: unknown) => writeFile(path.join(artifacts, name), `${JSON.stringify(data, null, 2)}\n`)
  const buildMarker = randomUUID()
  const build = await execa('pnpm', ['run', 'build:mp-weixin'], { cwd: demo, env: { ...process.env, UNI_BUILD_STRICT: '1', NODE_ENV: 'production', SKYLINE_PROBE_BUILD: buildMarker } })
  await writeFile(path.join(artifacts, 'build.log'), build.all ?? `${build.stdout}\n${build.stderr}`)
  const service = await existingWechatService()
  const records: unknown[] = []
  let mini: Awaited<ReturnType<Launcher['launch']>> | undefined
  let failure: unknown
  try {
    mini = await new Launcher().launch({ cliPath: service.command, projectPath: project, runtimeProvider: 'devtools', timeout: 90_000 })
    await save('environment.json', { service, system: await mini.systemInfo(), tool: await mini.toolInfo(), project, buildMarker })
    for (const renderer of ['skyline', 'webview']) {
      const page = await mini.reLaunch(`/pages/skyline-typography/${renderer}`)
      await page.waitForRendered({ selector: selector('probe-marker'), timeout: 15_000 })
      const identity = await mini.evaluate('function(){var pages=getCurrentPages();var p=pages[pages.length-1];return {route:p.route,renderer:p.renderer}}')
      expect(identity.renderer).toBe(renderer)
      expect(identity.route).toBe(`pages/skyline-typography/${renderer}`)
      await page.waitForRendered({ selector: selector('probe-build'), dataset: { build: buildMarker }, timeout: 10_000 })
      const measure = async () => {
        const observations: Rect[] = await mini!.evaluate(`function(selectors){return new Promise(function(resolve){
          var query=wx.createSelectorQuery();
          selectors.forEach(function(selector){query.select(selector).fields({id:true,rect:true,size:true,computedStyle:['line-height','font-weight']});});
          query.exec(resolve);
        });}`, ids.map(selector))
        observations.forEach((rect, i) => {
          expect(rect?.id).toBe(ids[i])
          expect(rect.width).toBeGreaterThan(0)
          expect(rect.height).toBeGreaterThan(0)
        })
        return Object.fromEntries(observations.map(rect => [rect.id, rect]))
      }
      const measured = await measure()
      records.push({ renderer, identity, phase: 'default', measured })
      await save('evidence.json', records)
      await captureMiniProgramScreenshot(mini, path.join(artifacts, `${renderer}-default.png`), 10_000)
      expect(measured['probe-reference']!.height).toBeCloseTo(64, 1)
      for (const fallback of ['literal', 'nested']) {
        for (const reset of ['missing', 'cycle']) {
          expect(measured[`probe-${reset}-${fallback}`]!.height).toBeCloseTo(64, 1)
        }
        expect(measured[`probe-valid-${fallback}`]!.height).toBeCloseTo(88, 1)
        expect(measured[`probe-empty-${fallback}`]!.height).toBeCloseTo(measured['probe-normal']!.height, 1)
      }
      // 记录引擎当前差异，不把尚未验证的全局自引用转换当作修复。
      if (renderer === 'webview') {
        expect(measured['probe-original']!.height).toBeCloseTo(64, 1)
        expect(measured['probe-weight-original']!.width).toBeCloseTo(measured['probe-weight-reference']!.width, 1)
      }
      else {
        expect(measured['probe-original']!.height).toBeCloseTo(measured['probe-normal']!.height, 1)
        expect(measured['probe-original']!.height).not.toBeCloseTo(64, 1)
      }
    }
  }
  catch (error) {
    failure = error
    await save('failure.json', { error: String(error), records })
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
}, 240_000)
