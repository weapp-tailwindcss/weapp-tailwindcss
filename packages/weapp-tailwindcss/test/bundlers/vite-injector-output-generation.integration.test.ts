import type { Plugin } from 'vite'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'

describe('Vite injector 资产生成顺序', () => {
  it.each(['wxss', 'acss'])('分包 .%s 在 injector 提交后完成生成和平台收尾', async (extension) => {
    const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'vite-injector-generation-')))
    try {
      await symlink(path.resolve(__dirname, '../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
      await mkdir(path.join(root, 'feature'))
      const pagesJsonPath = path.join(root, 'pages.json')
      const cssEntry = path.join(root, 'feature', 'theme.css')
      await writeFile(pagesJsonPath, JSON.stringify({ subPackages: [{ root: 'feature', pages: ['page'] }] }))
      await writeFile(path.join(root, 'entry.js'), 'export default "entry"')
      await writeFile(cssEntry, '@import "tailwindcss" source(none); @source inline("bg-accent"); @theme { --color-accent: #123456; }')
      const emitPage: Plugin = {
        name: 'fixture-page-style',
        buildStart() {
          this.emitFile({ type: 'asset', fileName: `feature/page.${extension}`, source: '.page{color:red}' })
        },
      }
      const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [emitPage, WeappTailwindcss({
          appType: 'uni-app-vite',
          platform: extension === 'wxss' ? 'mp-weixin' : 'mp-alipay',
          tailwindcssBasedir: root,
          cssEntries: [cssEntry],
          styleInjector: {
            subPackages: { pagesJsonPath, sourceFileName: 'theme.css', outputName: 'tokens', preprocess: false },
          },
        })],
        build: { write: false, minify: false, cssMinify: false, rollupOptions: { input: path.join(root, 'entry.js') } },
      })
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => 'output' in output ? output.output : [])
      const generated = outputs.find(output => output.type === 'asset' && output.fileName === `feature/tokens.${extension}`)
      expect(generated?.type).toBe('asset')
      const css = generated?.type === 'asset' ? String(generated.source) : ''
      expect(css).toContain('.bg-accent')
      expect(css).toContain('#123456')
      expect(css).not.toContain('generator-placeholder')
      expect(css).not.toContain('source(none)')
      expect(css).not.toContain('@import "tailwindcss"')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
