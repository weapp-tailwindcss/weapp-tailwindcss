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

it('只修改 reference 主题时重新编译 scoped apply，保留组件 reset、条件和作者覆盖', async () => {
  const root = await createCapabilityProject()
  let watcher: RollupWatcher | undefined
  try {
    const consumer = createRequire(path.resolve(__dirname, '../../../../demo/taro-vite-vue3-tailwindcss-v4/package.json'))
    const { default: vue } = await import(pathToFileURL(consumer.resolve('@vitejs/plugin-vue')).href) as { default: () => Plugin }
    const component = path.join(root, 'Label.vue')
    const theme = path.join(root, 'theme.css')
    const source = '<template><view class="label">label</view></template><style scoped>@reference "./theme.css";@media(min-width:1px){.label{@apply w-1}}.label{color:blue!important}</style>'
    const themeSource = (spacing: number) => `@import "tailwindcss" source(none);@theme inline{--spacing:${spacing}rpx}`
    await writeFile(component, source)
    await writeFile(theme, themeSource(17))
    await writeFile(path.join(root, 'entry.js'), 'import Label from "./Label.vue";export {Label}')
    const observer = createCapabilityWatchObserver()
    watcher = await build({
      ...capabilityBuildConfig(root, [
        vue(),
        ...WeappTailwindcss({
          appType: 'uni-app-vite', platform: 'mp-weixin', cssOptions: { skyline: true },
          tailwindcssBasedir: root, cssEntries: [theme], generator: { target: 'weapp' },
        }),
        observer.plugin,
      ], true),
      resolve: { alias: { vue: consumer.resolve('vue/dist/vue.runtime.esm-bundler.js') } },
    }) as RollupWatcher
    observer.attach(watcher)
    const verify = (spacing: number) => (assets: Map<string, string>) => {
      const css = [...assets.values()].join('\n')
      expect(css).toMatch(new RegExp(`width:\\s*${spacing}rpx`))
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
    expect(await readFile(component, 'utf8')).toBe(source)
  }
  finally {
    await watcher?.close()
    await rm(root, { recursive: true, force: true })
  }
}, 45_000)
