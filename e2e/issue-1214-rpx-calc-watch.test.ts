import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { expect, it } from 'vitest'
import { createWatchCommandSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { waitFor, writeWatchedFilePreserveEol } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { createProject, pageSource, readOutput, readProbeDeclarations, themeSource } from './issue-1214/project'

it('Issue #1214 同一 uni-app 微信 watch 进程不复用旧主题计算或已移除候选', async () => {
  const project = await createProject()
  const session = await createWatchCommandSession(project.root, ['exec', process.execPath, project.uniBin, '-p', 'mp-weixin'], { quietSass: true }, {
    ...project.env,
    NODE_ENV: 'development',
    WEAPP_TW_HMR_TIMING: '0',
  })
  const startedAt = session.startedAt ?? Date.now()
  const pid = session.child.pid
  const snapshots: Record<string, unknown> = {}
  let lastObserved = ''
  async function verify(phase: string, since: number, expectedWidth: string | undefined, marker: string) {
    try {
      await waitFor(async () => {
        if (session.lastCompileSuccessAt() < since) {
          return false
        }
        const { css, wxml } = await readOutput(project)
        const declarations = readProbeDeclarations(css)
        lastObserved = JSON.stringify({ declarations, wxml })
        if (!wxml.includes(`issue-1214-${marker}`)) {
          return false
        }
        const widths = declarations['.w-32']
        if (expectedWidth ? !widths?.length || widths.some(value => value !== expectedWidth) : widths != null) {
          return false
        }
        const padding = phase === 'initial' ? '4rpx' : '8rpx'
        const paddings = declarations['.p-4']
        if (!paddings?.length || paddings.some(value => value !== padding)) {
          return false
        }
        snapshots[phase] = declarations
        return true
      }, {
        timeoutMs: 60_000,
        pollMs: 100,
        message: `[issue-1214] ${phase} 没有得到本轮主题与候选产物`,
        onTick: session.ensureRunning,
      })
      expect(session.child.pid).toBe(pid)
      session.ensureRunning()
    }
    catch (error) {
      throw new Error(`${String(error)}\n最近产物: ${lastObserved}\n编译器日志:\n${session.logs()}`, { cause: error })
    }
  }
  try {
    await verify('initial', startedAt, '32rpx', 'initial')
    expect(session.logs()).not.toContain('[rpx-theme]')

    const themeUpdatedAt = Date.now()
    await writeWatchedFilePreserveEol(project.themeFile, themeSource({ spacing: '2rpx' }), await readFile(project.themeFile, 'utf8'))
    await verify('theme-updated', themeUpdatedAt, '64rpx', 'initial')

    const removedAt = Date.now()
    await writeWatchedFilePreserveEol(project.pageFile, pageSource('p-4', 'removed'), await readFile(project.pageFile, 'utf8'))
    await verify('removed', removedAt, undefined, 'removed')

    const addedAt = Date.now()
    await writeWatchedFilePreserveEol(project.pageFile, pageSource('w-32 p-4', 'restored'), await readFile(project.pageFile, 'utf8'))
    await verify('restored', addedAt, '64rpx', 'restored')
    expect(session.logs()).not.toContain('[rpx-theme]')

    for (const base of ['3rpx', '4rpx']) {
      const changedAt = Date.now()
      await writeWatchedFilePreserveEol(project.themeFile, themeSource({
        spacing: '2rpx',
        overrides: `.scope { --spacing: ${base}; }`,
      }), await readFile(project.themeFile, 'utf8'))
      await waitFor(async () => {
        if (session.lastCompileSuccessAt() < changedAt) {
          return false
        }
        const { css, wxml } = await readOutput(project)
        const declarations = readProbeDeclarations(css)
        if (!wxml.includes('issue-1214-restored') || declarations['.w-32']?.at(-1) !== 'calc(var(--spacing)*32)') {
          return false
        }
        snapshots[`override-${base}`] = declarations
        return (session.logs().match(/\[rpx-theme\]/g) ?? []).length === 1
      }, { timeoutMs: 60_000, pollMs: 100, message: '新增覆盖后应保留 calc 并仅提示一次', onTick: session.ensureRunning })
      expect(session.child.pid).toBe(pid)
    }
    const clearedAt = Date.now()
    await writeWatchedFilePreserveEol(project.themeFile, themeSource({ spacing: '2rpx' }), await readFile(project.themeFile, 'utf8'))
    await verify('override-cleared', clearedAt, '64rpx', 'restored')
    expect(session.logs().match(/\[rpx-theme\]/g)).toHaveLength(1)
    await expect(`${JSON.stringify(snapshots, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1214/watch.json')
  }
  finally {
    await session.stop()
    await project.close()
  }
}, 270_000)
