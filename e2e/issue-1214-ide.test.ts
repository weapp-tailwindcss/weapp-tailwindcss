import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { wechatVersion } from '../scripts/e2e-preflight/probes/wechat-version'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { collectFrameworkIdeDiagnostics } from './frameworkIdeDiagnostics'
import { createLayoutProject, runtimeSpacing } from './issue-1214/ide-project'
import { compareLayout } from './issue-1214/layout'
import { buildProject, readOutput } from './issue-1214/project'
import { readLayoutRects } from './issue-1214/read-layout'

const describeIde = process.env['E2E_IDE'] === '1' ? describe : describe.skip
const artifactRoot = path.resolve(import.meta.dirname, '.artifacts', 'issue-1214-ide')

describeIde('Issue #1214 微信 DevTools 实际尺寸', () => {
  it('工具类与直接最终 rpx 的宽高、padding、负 margin 和 gap 相等', async () => {
    const cliPath = process.env['E2E_PREFLIGHT_WECHAT_CLI']
    if (!cliPath) {
      throw new Error('请设置 E2E_PREFLIGHT_WECHAT_CLI 指向本轮验收的微信 IDE；全面验收必须先通过当前预检。')
    }
    const marker = `issue-1214-${randomUUID()}`
    await mkdir(artifactRoot, { recursive: true })
    const artifactDir = await mkdtemp(path.join(artifactRoot, 'run-'))
    const project = await createLayoutProject(marker)
    const screenshotPath = path.join(artifactDir, 'layout.png')
    let miniProgram: MiniProgram | undefined
    let launchAttempted = false
    const evidence: Record<string, unknown> = { marker, projectRoot: project.root, outputRoot: project.output, artifactDir, observedAt: new Date().toISOString(), versions: project.versions }
    try {
      const build = await buildProject(project)
      await writeFile(path.join(artifactDir, 'build.log'), `${build.stdout}\n${build.stderr}`)
      const output = await readOutput(project)
      expect(output.wxml).toContain(marker)
      await writeFile(path.join(artifactDir, 'output.wxss'), output.css)
      await writeFile(path.join(artifactDir, 'output.wxml'), output.wxml)
      evidence['devtools'] = await wechatVersion(cliPath)
      const automator = new Launcher()
      launchAttempted = true
      miniProgram = await automator.launch({ cliPath, projectPath: project.output, runtimeProvider: 'devtools', timeout: 90_000 })
      const page = await miniProgram!.reLaunch('/pages/index')
      if (!page) {
        throw new Error('本轮微信运行时没有进入 /pages/index。')
      }
      await page.waitForRendered({ selector: '#utility-box', timeout: 15_000 })
      expect(await (await page.$('#issue-1214-marker'))?.text()).toBe(marker)
      const system = await miniProgram!.systemInfo()
      evidence['system'] = system
      for (const field of ['SDKVersion', 'model', 'system', 'platform']) {
        expect(system[field], `缺少运行环境 ${field}`).toBeTypeOf('string')
        expect(system[field].length, `运行环境 ${field} 为空`).toBeGreaterThan(0)
      }
      expect(system.platform, '必须使用真实微信 DevTools provider').toBe('devtools')
      const { utility, reference, rawRects } = await readLayoutRects(miniProgram!)
      const comparison = compareLayout(utility, reference, system.windowWidth, runtimeSpacing)
      Object.assign(evidence, { utility, reference, rawRects, comparison, measurementSource: 'wx.createSelectorQuery().boundingClientRect()' })
      const screenshot = await captureMiniProgramViewport(miniProgram, screenshotPath, 30_000)
      Object.assign(evidence, { screenshot: screenshotPath, screenshotSize: { width: screenshot.width, height: screenshot.height } })
      expect(screenshot.width).toBeGreaterThan(0)
      expect(screenshot.height).toBeGreaterThan(0)
      expect(comparison.passed, JSON.stringify(comparison, null, 2)).toBe(true)
      evidence['status'] = 'passed'
    }
    catch (error) {
      evidence['status'] = 'failed'
      evidence['error'] = String(error)
      evidence['diagnostics'] = await collectFrameworkIdeDiagnostics('issue-1214')
      if (miniProgram) {
        await captureMiniProgramViewport(miniProgram, path.join(artifactDir, 'failure.png'), 5000).catch((captureError) => {
          evidence['screenshotError'] = String(captureError)
        })
      }
      throw error
    }
    finally {
      await writeFile(path.join(artifactDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
      try {
        if (launchAttempted) {
          await closeWechatProject(project.output, miniProgram)
        }
      }
      finally {
        await project.close()
      }
      process.stdout.write(`[issue-1214] DevTools 尺寸证据：${artifactDir}\n`)
    }
  }, 270_000)
})
