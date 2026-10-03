import { randomUUID } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { wechatVersion } from '../scripts/e2e-preflight/probes/wechat-version'
import { resolveWechatAppId } from '../scripts/wechat-app-id'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { measure, setLayout } from './issue-1241/layout'
import { build, createProject, evidence } from './issue-1241/project'
import { artifacts, save } from './issue-1241/support'

it.runIf(process.env.E2E_IDE === '1')('Issue 1241 微信 DevTools 双入口尺寸对照', async () => {
  const version = 'workspace'
  const cliPath = process.env.E2E_PREFLIGHT_WECHAT_CLI
  if (!cliPath) {
    throw new Error('请指定本轮微信 DevTools 官方 CLI')
  }
  const project = await createProject('ide', { secondTheme: '1rpx', wechatAppId: resolveWechatAppId() })
  const launcher = new Launcher()
  let miniProgram: Awaited<ReturnType<typeof launcher.launch>> | undefined
  const results = []
  try {
    for (const base of [1, 2, 3, 8]) {
      const marker = `release-${version}-${base}-${randomUUID()}`
      await setLayout(project, base, marker)
      await build(project, `build-${base}`)
      const output = await evidence(project, `output-${base}`)
      expect(output.wxml).toContain(marker)
      if (!miniProgram) {
        miniProgram = await launcher.launch({ cliPath, projectPath: project.output, runtimeProvider: 'devtools', timeout: 90_000 })
      }
      else {
        await miniProgram.waitForAppReady(30_000)
      }
      // DevTools 2.02 不实现 Tool.compile；沿用文件更新与公开页面 API，按本轮 marker 等待。
      await expect.poll(async () => {
        try {
          const page = await miniProgram!.reLaunch('/pages/index')
          await page.waitForRendered({ selector: '#utility-box', timeout: 5000 })
          return await (await page.$('#release-marker'))?.text()
        }
        catch { return undefined }
      }, { timeout: 30_000, interval: 250 }).toBe(marker)
      const system = await miniProgram.systemInfo()
      expect(system.platform).toBe('devtools')
      const measurements = await measure(miniProgram, base, system.windowWidth)
      const screenshotPath = path.join(artifacts, version, 'ide', `layout-${base}.png`)
      await captureMiniProgramViewport(miniProgram, screenshotPath, 30_000)
      const result = {
        version,
        base,
        marker,
        projectRoot: project.root,
        outputRoot: project.output,
        observedAt: new Date().toISOString(),
        devtools: await wechatVersion(cliPath),
        system,
        renderer: await miniProgram.evaluate('function() { return { app: typeof __wxConfig !== "undefined" ? (__wxConfig.renderer || null) : null, page: getCurrentPages().map(function(page) { return {route: page.route, renderer: page.renderer || null} }) }; }'),
        toolInfo: await miniProgram.toolInfo(),
        measurements,
        screenshotPath,
      }
      results.push(result)
      await save(`${version}/ide/evidence.json`, results)
      expect(measurements.passed, JSON.stringify(measurements)).toBe(true)
    }
  }
  catch (error) {
    await save(`${version}/ide/failure.json`, { error: String(error), projectRoot: project.root, results })
    if (miniProgram) {
      await captureMiniProgramViewport(miniProgram, path.join(artifacts, version, 'ide', 'failure.png'), 5000).catch(() => {})
    }
    throw error
  }
  finally {
    if (miniProgram) {
      await closeWechatProject(project.output, miniProgram)
    }
  }
}, 600_000)
