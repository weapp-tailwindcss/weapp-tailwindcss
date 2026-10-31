import type { RollupWatcher } from 'rollup'
import type { Plugin } from 'vite'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { capabilityBuildConfig, createCapabilityProject, createCapabilityWatchObserver } from './fixtures/capability-build'

it.each([1, 2])('只修改 reference 主题时重新编译 %s 个独立 style，保留组件 reset、条件和作者覆盖', async (styleCount) => {
  const root = await createCapabilityProject()
  let watcher: RollupWatcher | undefined
  try {
    const consumer = createRequire(path.resolve(__dirname, '../../../../demo/taro-vite-vue3-tailwindcss-v4/package.json'))
    const { default: vue } = await import(pathToFileURL(consumer.resolve('@vitejs/plugin-vue')).href) as { default: () => Plugin }
    const component = path.join(root, 'Label.vue')
    const theme = path.join(root, 'theme.css')
    const otherTheme = path.join(root, 'other-theme.css')
    const source = '<template><view class="label">label</view></template><style scoped>@reference "./theme.css";@media(min-width:1px){.label{@apply w-1}}.label{color:blue!important}</style>' + (styleCount === 2 ? '<style scoped>@reference "./other-theme.css";.other-label{@apply h-1}</style>' : '')
    const themeSource = (spacing: number) => `@import "tailwindcss" source(none);@theme inline{--spacing:${spacing}rpx}`
    await writeFile(component, source)
    await writeFile(theme, themeSource(17))
    if (styleCount === 2) {
      await writeFile(otherTheme, themeSource(29))
    }
    await writeFile(path.join(root, 'entry.js'), 'import Label from "./Label.vue";export {Label}')
    const observer = createCapabilityWatchObserver()
    const config = capabilityBuildConfig(root, [
        vue(),
        ...WeappTailwindcss({
          appType: 'uni-app-vite', platform: 'mp-weixin', cssOptions: { skyline: true },
          tailwindcssBasedir: root, cssEntries: styleCount === 2 ? [theme, otherTheme] : [theme], generator: { target: 'weapp' },
        }),
        observer.plugin,
      ], true)
    watcher = await build({
      ...config,
      // 临时目录使用轮询，避免 macOS 文件事件延迟干扰依赖失效断言。
      build: { ...config.build, watch: { chokidar: { usePolling: true, interval: 50 } } },
      resolve: { alias: { vue: consumer.resolve('vue/dist/vue.runtime.esm-bundler.js') } },
    }) as RollupWatcher
    observer.attach(watcher)
    const verify = (spacing: number, otherSpacing: number | null = 29) => (assets: Map<string, string>) => {
      const css = [...assets.values()].join('\n')
      expect(css).toMatch(new RegExp(`width:\\s*${spacing}rpx`))
      if (styleCount === 2 && otherSpacing !== null) {
        expect(css).toMatch(new RegExp(`height:\\s*${otherSpacing}rpx`))
      }
      expect(css).toMatch(/\.label(?:\[data-v-|\.data-v-)/)
      expect(css).toMatch(/@media\s*\(min-width:\s*1px\)/)
      expect(css).toMatch(/color:\s*blue\s*!important/)
      expect(css).toContain('--tw-leading: var(--weapp-tw-invalid-reset)')
      expect(css).not.toMatch(/@apply\b/)
    }
    await observer.waitFor(1, verify(17))
    await writeFile(theme, themeSource(23))
    await observer.waitFor(2, (assets) => {
      verify(23)(assets)
      expect([...assets.values()].join('\n')).not.toMatch(/width:\s*17rpx/)
    })
    if (styleCount === 2) {
      await writeFile(otherTheme, themeSource(31))
      await observer.waitFor(3, (assets) => {
        verify(23, 31)(assets)
        expect([...assets.values()].join('\n')).not.toMatch(/height:\s*29rpx/)
      })
    }
    if (styleCount === 2) {
      const remainingSource = source.slice(0, source.lastIndexOf('<style scoped>'))
      await writeFile(component, remainingSource)
      await observer.waitFor(4, (assets) => {
        verify(23, null)(assets)
        expect([...assets.values()].join('\n')).not.toContain('other-label')
        expect([...assets.values()].join('\n')).not.toMatch(/height:\s*31rpx/)
      })
      await writeFile(theme, themeSource(37))
      await observer.waitFor(5, (assets) => {
        verify(37, null)(assets)
        expect([...assets.values()].join('\n')).not.toContain('other-label')
        expect([...assets.values()].join('\n')).not.toMatch(/height:\s*31rpx/)
      })
      expect(await readFile(component, 'utf8')).toBe(remainingSource)
    }
    else {
      expect(await readFile(component, 'utf8')).toBe(source)
    }
  }
  finally {
    await watcher?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
