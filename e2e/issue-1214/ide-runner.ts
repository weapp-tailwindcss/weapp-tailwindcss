import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect } from 'vitest'
import { captureMiniProgramViewport } from '../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { wechatVersion } from '../../scripts/e2e-preflight/probes/wechat-version'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { Launcher } from '../../scripts/wechat/automator'
import { withCleanup } from '../framework-ide/cleanup'
import { collectFrameworkIdeDiagnostics } from '../frameworkIdeDiagnostics'
import { createLayoutProject, runtimeSpacing } from './ide-project'
import { compareLayout } from './layout'
import { buildProject, readOutput } from './project'
import { readLayoutRects } from './read-layout'

export async function runLayoutIdeProbe(artifactRoot: string) {
  const cliPath = process.env['E2E_PREFLIGHT_WECHAT_CLI']
  if (!cliPath) {
    throw new Error('请设置 E2E_PREFLIGHT_WECHAT_CLI 指向本轮验收的微信 IDE；全面验收必须先通过当前预检。')
  }
  const marker = `issue-1214-${randomUUID()}`
  await fs.mkdir(artifactRoot, { recursive: true })
  const artifactDir = await fs.mkdtemp(path.join(artifactRoot, 'run-'))
  const project = await createLayoutProject(marker)
  const screenshotPath = path.join(artifactDir, 'layout.png')
  let miniProgram: MiniProgram | undefined
  const evidence: Record<string, unknown> = { marker, projectRoot: project.root, outputRoot: project.output, artifactDir, observedAt: new Date().toISOString(), versions: project.versions }
  await runWithCleanup(async () => {
    try {
      await withCleanup(async () => {
        try {
          const build = await buildProject(project)
          await fs.writeFile(path.join(artifactDir, 'build.log'), `${build.stdout}\n${build.stderr}`)
          const output = await readOutput(project)
          expect(output.wxml).toContain(marker)
          await fs.writeFile(path.join(artifactDir, 'output.wxss'), output.css)
          await fs.writeFile(path.join(artifactDir, 'output.wxml'), output.wxml)
          evidence['devtools'] = await wechatVersion(cliPath)
          const automator = new Launcher()
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
          evidence['error'] = formatWorkflowError(error)
          return withCleanup(() => Promise.reject(error), [
            { label: 'Failed to collect layout diagnostics', run: async () => { evidence['diagnostics'] = await collectFrameworkIdeDiagnostics('issue-1214') } },
            { label: 'Failed to capture layout failure', run: async () => {
              if (miniProgram) {
                await captureMiniProgramViewport(miniProgram, path.join(artifactDir, 'failure.png'), 5000)
              }
            } },
          ])
        }
      }, [
        { label: 'Failed to close layout IDE project', run: async () => {
          if (miniProgram) {
            await closeWechatProject(project.output, miniProgram)
          }
        } },
        { label: 'Failed to remove layout fixture', run: () => project.close() },
      ])
    }
    catch (error) {
      evidence['status'] = 'failed'
      evidence['error'] = formatWorkflowError(error)
      throw error
    }
  }, () => fs.writeFile(path.join(artifactDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`))
  process.stdout.write(`[issue-1214] DevTools 尺寸证据：${artifactDir}\n`)
}
