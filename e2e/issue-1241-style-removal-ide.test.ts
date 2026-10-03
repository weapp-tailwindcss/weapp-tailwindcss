import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { wechatVersion } from '../scripts/e2e-preflight/probes/wechat-version'
import { resolveWechatAppId } from '../scripts/wechat-app-id'
import { closeWechatProject } from '../scripts/wechat-project-cleanup'
import { Launcher } from '../scripts/wechat/automator'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { createProject, readOutput } from './issue-1241/project'
import { styleRemovalPage } from './issue-1241/style-removal'
import { artifacts, save } from './issue-1241/support'
import { watchSession } from './issue-1241/watch-session'

it.runIf(process.env.E2E_IDE === '1')('微信 watch 删除整块 style 后实际尺寸恢复，重复恢复和清空仍一致', async () => {
  const cliPath = process.env.E2E_PREFLIGHT_WECHAT_CLI
  if (!cliPath) {
    throw new Error('请指定本轮微信官方 CLI')
  }
  const project = await createProject('style-removal-ide', { spacing: '2rpx', wechatAppId: resolveWechatAppId() })
  const id = randomUUID()
  await save('style-removal-ide/identity.json', { project: project.root, output: project.output, id })
  await writeFile(project.pageFile, styleRemovalPage(`${id}-initial`, 'initial'))
  const session = watchSession(project)
  const pid = session.child.pid
  let miniProgram: Awaited<ReturnType<Launcher['launch']>> | undefined
  const results = []
  try {
    for (const [index, phase] of (['initial', 'removed', 'initial', 'empty'] as const).entries()) {
      const marker = `${id}-${index}-${phase}`
      const since = Date.now()
      await writeFile(project.pageFile, styleRemovalPage(marker, phase))
      await waitFor(async () => {
        const output = await readOutput(project).catch(() => undefined)
        return session.lastCompileSuccessAt() >= since && !!output?.wxml.includes(marker)
          && output.css.includes('--spacing:3rpx') === (phase === 'initial')
          && (phase === 'initial' || output.declarations['.w-32']?.every(value => value === '64rpx') === true)
      }, { timeoutMs: 60_000, pollMs: 100, message: `style-removal ${phase} 产物未完成`, onTick: session.ensureRunning })
      miniProgram ??= await new Launcher().launch({ cliPath, projectPath: project.output, runtimeProvider: 'devtools', timeout: 90_000 })
      await expect.poll(async () => {
        const page = await miniProgram!.reLaunch('/pages/index')
        await page.waitForRendered({ selector: '#probe', timeout: 5000 })
        return await (await page.$('#release-marker'))?.text()
      }, { timeout: 30_000, interval: 250 }).toBe(marker)
      const system = await miniProgram.systemInfo()
      expect(system.platform).toBe('devtools')
      const rects = await miniProgram.evaluate('function() { return new Promise(function(resolve) { const query = wx.createSelectorQuery(); query.select("#probe").boundingClientRect(); query.select("#reference").boundingClientRect(); query.exec(resolve); }); }')
      expect(rects).toHaveLength(2)
      for (const rect of rects) {
        expect(rect.width).toBeGreaterThan(0)
        expect(rect.height).toBeGreaterThan(0)
      }
      if (phase !== 'initial') {
        expect(rects[0].width).toBe(rects[1].width)
        expect(rects[0].height).toBe(rects[1].height)
      }
      const screenshot = path.join(artifacts, 'style-removal-ide', `${index}-${phase}.png`)
      await captureMiniProgramViewport(miniProgram, screenshot, 30_000)
      results.push({ phase, marker, pid, rects, system, screenshot, observedAt: new Date().toISOString(), devtools: await wechatVersion(cliPath) })
      await save('style-removal-ide/evidence.json', { project: project.root, results })
      expect(session.child.pid).toBe(pid)
    }
  }
  finally {
    await save('style-removal-ide/watch.log', session.logs())
    await session.stop()
    if (miniProgram) {
      await closeWechatProject(project.output, miniProgram)
    }
  }
}, 300_000)
