import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { expect } from 'vitest'
import { captureMiniProgramViewport } from '../../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { formatWorkflowError, runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { wechatVersion } from '../../scripts/e2e-preflight/probes/wechat-version'
import { resolveWechatAppId } from '../../scripts/wechat-app-id'
import { closeWechatProject } from '../../scripts/wechat-project-cleanup'
import { Launcher } from '../../scripts/wechat/automator'
import { waitFor } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { withCleanup } from '../framework-ide/cleanup'
import { createProject, readOutput } from './project'
import { styleRemovalPage } from './style-removal'
import { artifacts, save } from './support'
import { watchSession } from './watch-session'

export async function runStyleRemovalIdeProbe() {
  const cliPath = process.env.E2E_PREFLIGHT_WECHAT_CLI
  if (!cliPath) {
    throw new Error('请指定本轮微信官方 CLI')
  }
  const project = await createProject('style-removal-ide', { spacing: '2rpx', wechatAppId: resolveWechatAppId() })
  const id = randomUUID()
  const artifactDir = path.join('style-removal-ide', id)
  await save(path.join(artifactDir, 'identity.json'), { project: project.root, output: project.output, id })
  await writeFile(project.pageFile, styleRemovalPage(`${id}-initial`, 'initial'))
  const session = watchSession(project)
  const pid = session.child.pid
  let miniProgram: Awaited<ReturnType<Launcher['launch']>> | undefined
  const results: Record<string, unknown>[] = []
  const evidence = { project: project.root, id, results, status: 'running', error: undefined as string | undefined }
  await runWithCleanup(async () => {
    try {
      await withCleanup(async () => {
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
          const screenshot = path.join(artifacts, artifactDir, `${index}-${phase}.png`)
          await captureMiniProgramViewport(miniProgram, screenshot, 30_000)
          results.push({ phase, marker, pid, rects, system, screenshot, observedAt: new Date().toISOString(), devtools: await wechatVersion(cliPath) })
          await save(path.join(artifactDir, 'evidence.json'), evidence)
          expect(session.child.pid).toBe(pid)
        }
      }, [
        { label: '保存 style-removal watch 日志失败', run: () => save(path.join(artifactDir, 'watch.log'), session.logs()) },
        { label: '停止 style-removal watcher 失败', run: () => session.stop() },
        { label: '关闭 style-removal IDE 项目失败', run: async () => {
          if (miniProgram) {
            await closeWechatProject(project.output, miniProgram)
          }
        } },
      ])
      evidence.status = 'passed'
    }
    catch (error) {
      evidence.status = 'failed'
      evidence.error = formatWorkflowError(error)
      throw error
    }
  }, () => save(path.join(artifactDir, 'evidence.json'), evidence))
}
