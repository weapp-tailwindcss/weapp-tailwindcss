import type { RollupWatcher } from 'rollup'
import type { CapabilitySessionEvidence } from './fixtures/production-capability-framework'
import type { UserDefinedOptions } from '@/types'
import { rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { capabilityBuildConfig, createCapabilityProject, createCapabilityWatchObserver, outputAssets, waitForCapabilityTask } from './fixtures/capability-build'
import { capabilityOutput, createProductionCapabilityFramework } from './fixtures/production-capability-framework'

function optionsFor(root: string): UserDefinedOptions {
  return {
    tailwindcssBasedir: root,
    cssEntries: [path.join(root, 'entry.css')],
    rewriteCssImports: false,
    styleInjector: false,
    generator: { target: 'web', hmr: { preserveDeletedCss: false } },
  }
}

function assertCapabilities(assets: Map<string, string>, state: CapabilitySessionEvidence) {
  // 样式组织能力把配置入口生成的样式注入框架声明的根资产。
  const rootCss = assets.get(capabilityOutput.styles) ?? ''
  expect(rootCss).toContain('.capability-shell')
  expect(rootCss).toContain('.capability-generation')
  expect([...assets.values()].join('\n')).toContain('.capability-emission')
  expect([...state.groups].sort()).toEqual(['assets', 'generation', 'sources', 'styles'])
  const metadata = JSON.stringify({ session: state.id, build: state.builds })
  expect(assets.get(capabilityOutput.replaced)).toBe(metadata)
  expect(assets.get(capabilityOutput.emitted)).toBe(metadata)
  expect(assets.has(capabilityOutput.removed)).toBe(false)
  expect(state).toMatchObject({
    assetViewsFrozen: true,
    replacedViewRetained: true,
    duplicateEmissionRejected: true,
    missingReplacementRejected: true,
  })
  return rootCss
}

describe('新框架复用生产 Vite 组装器', () => {
  it.each(['binding', 'configuration'] as const)('生产包装后的内层 %s 失败仍释放实际扩展', async (stage) => {
    const root = await createCapabilityProject()
    const sessions: CapabilitySessionEvidence[] = []
    const plugins = createProductionCapabilityFramework(optionsFor(root), sessions, undefined, stage)
    try {
      await expect(build(capabilityBuildConfig(root, plugins))).rejects.toThrow(stage === 'binding' ? '钩子与声明不一致' : 'fixture initialization failed')
      expect(sessions).toHaveLength(1)
      expect(sessions[0]).toMatchObject({ closes: 1, events: ['closed'] })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('同一插件配置的独立 build 创建独立扩展与编译会话', async () => {
    const root = await createCapabilityProject()
    const sessions: CapabilitySessionEvidence[] = []
    const plugins = createProductionCapabilityFramework(optionsFor(root), sessions)
    try {
      expect(sessions).toHaveLength(0)
      for (const [index, width] of [17, 29, 43].entries()) {
        await writeFile(path.join(root, 'view.html'), `<view class="w-[${width}px]" />`)
        const assets = outputAssets(await build(capabilityBuildConfig(root, plugins)))
        const state = sessions[index]!
        const css = assertCapabilities(assets, state)
        expect(css).toContain(`width: ${width}px`)
        for (const previous of [17, 29, 43].filter(value => value !== width)) {
          expect(css).not.toContain(`width: ${previous}px`)
        }
        expect(state).toMatchObject({ id: index + 1, builds: 1, closes: 1 })
        expect(state.events.at(-1)).toBe('closed')
      }
      expect(sessions).toHaveLength(3)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)

  it('真实 watch 连续更新、删除来源并排空在途转换后关闭，再允许独立 build', async ({ signal }) => {
    const root = await createCapabilityProject()
    const sessions: CapabilitySessionEvidence[] = []
    const observer = createCapabilityWatchObserver()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let holdNextTransform = false
    let watcher: RollupWatcher | undefined
    let closing: Promise<void> | undefined
    const plugins = createProductionCapabilityFramework(optionsFor(root), sessions, async () => {
      if (holdNextTransform) {
        holdNextTransform = false
        entered.resolve()
        await release.promise
      }
    })
    try {
      const result = await build(capabilityBuildConfig(root, [...plugins, observer.plugin], true))
      if (Array.isArray(result) || 'output' in result) {
        throw new Error('预期真实 Rollup watcher，实际取得单次构建产物')
      }
      watcher = result
      observer.attach(watcher)
      for (const [index, width] of [17, 29, 43].entries()) {
        if (index > 0) {
          await writeFile(path.join(root, 'view.html'), `<view class="w-[${width}px]" />`)
        }
        await observer.waitFor(index + 1, (assets) => {
          const css = assertCapabilities(assets, sessions[0]!)
          expect(css).toContain(`width: ${width}px`)
          if (index > 0) {
            expect(css).not.toContain(`width: ${[17, 29][index - 1]}px`)
          }
        })
        expect(sessions[0]!.closes).toBe(0)
      }
      await unlink(path.join(root, 'view.html'))
      await observer.waitFor(4, (assets) => {
        const css = assertCapabilities(assets, sessions[0]!)
        expect(css).not.toContain('width: 43px')
      })

      holdNextTransform = true
      await writeFile(path.join(root, 'entry.css'), '@import "tailwindcss" source(none); @source inline("h-[53px]");')
      await waitForCapabilityTask(entered.promise, signal)
      let closed = false
      closing = watcher.close().then(() => {
        closed = true
      })
      await Promise.resolve()
      expect(closed).toBe(false)
      expect(sessions[0]!.closes).toBe(0)
      release.resolve()
      await closing
      await watcher.close()
      const previous = sessions[0]!
      expect(previous.closes).toBe(1)
      expect(previous.events.at(-1)).toBe('closed')
      expect(previous.events.lastIndexOf('transform:end')).toBeGreaterThan(previous.events.lastIndexOf('transform:start'))

      const previousEvents = [...previous.events]
      const rebuilt = outputAssets(await build(capabilityBuildConfig(root, plugins)))
      expect(assertCapabilities(rebuilt, sessions[1]!)).toContain('height: 53px')
      expect(sessions).toHaveLength(2)
      expect(sessions[1]).toMatchObject({ id: 2, builds: 1, closes: 1 })
      expect(previous.events).toEqual(previousEvents)
    }
    finally {
      release.resolve()
      await (closing ?? watcher?.close())
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
