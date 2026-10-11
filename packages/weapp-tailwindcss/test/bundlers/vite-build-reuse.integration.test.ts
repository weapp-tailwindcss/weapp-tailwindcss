import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import { WeappTailwindcssWeb } from '@/vite-web'

describe('Vite 多次构建复用插件配置', () => {
  it.each([['主入口', WeappTailwindcss], ['Web 入口', WeappTailwindcssWeb]] as const)('%s 客户端关闭后 SSR 构建使用新状态', async (_name, factory) => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vite-build-reuse-')))
    try {
      await symlink(path.resolve(__dirname, '../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
      await writeFile(path.join(root, 'entry.js'), 'import "./entry.css"; export default "bg-accent"')
      await writeFile(path.join(root, 'entry.css'), '@import "tailwindcss" source(none); @source inline("bg-accent"); @theme { --color-accent: #123456; }')
      const plugins = factory({ tailwindcssBasedir: root, cssEntries: [path.join(root, 'entry.css')], generator: { target: 'web' } })
      for (const ssr of [false, true, false]) {
        const result = await build({
          root,
          configFile: false,
          logLevel: 'silent',
          plugins,
          build: { write: false, minify: false, cssMinify: false, ssr, ssrEmitAssets: true, rollupOptions: { input: path.join(root, 'entry.js') } },
        })
        const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => 'output' in output ? output.output : [])
        const css = outputs.filter(output => output.type === 'asset' && output.fileName.endsWith('.css')).map(output => String(output.source)).join('\n')
        expect(css).toContain('#123456')
        expect(css).toContain('.bg-accent')
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
