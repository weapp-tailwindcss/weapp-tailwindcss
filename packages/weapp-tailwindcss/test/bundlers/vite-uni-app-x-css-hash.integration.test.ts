import type { OutputAsset, RollupOutput } from 'rollup'
import type { InlineConfig, build } from 'vite'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { build as build5 } from 'vite5'
import { build as build6 } from 'vite6'
import { build as build7 } from 'vite7'
import { build as build8 } from 'vite8'
import { describe, expect, it } from 'vitest'
import { stripBundlerGeneratedCssMarkers } from '@/bundlers/shared/generated-css-marker'
import { WeappTailwindcss } from '@/bundlers/vite'
import { UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER } from '@/uni-app-x/web-preflight-reset'

function cssSource(source: string | Uint8Array) {
  // Vite 自己的 hash 版本标记会在 generateBundle 中删除，不属于框架最终化变换。
  return stripBundlerGeneratedCssMarkers(typeof source === 'string' ? source : Buffer.from(source).toString('utf8'))
}

function digest(source: string | Uint8Array) {
  return createHash('sha256').update(cssSource(source)).digest('hex').slice(0, 16)
}

describe.each([
  { version: 5, build: build5 as typeof build },
  { version: 6, build: build6 as typeof build },
  { version: 7, build: build7 as typeof build },
  { version: 8, build: build8 as unknown as typeof build },
])('Vite $version uni-app X H5 生产 CSS 的内容与资源身份', ({ build: buildVite }) => {
  it.each([
    { cssCodeSplit: true, cssMinify: false },
    { cssCodeSplit: false, cssMinify: false },
    { cssCodeSplit: true, cssMinify: true },
    { cssCodeSplit: false, cssMinify: true },
  ])('在命名之前完成 reset，拆分=$cssCodeSplit 压缩=$cssMinify', async ({ cssCodeSplit, cssMinify }) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'uni-app-x-css-hash-')))
    try {
      await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      await writeFile(path.join(root, 'index.html'), '<script type="module" src="./entry.js"></script>')
      await writeFile(path.join(root, 'entry.js'), 'import "./theme.css";import "./framework.css";window.loadPage=()=>import("./page.js")')
      await writeFile(path.join(root, 'theme.css'), '@import "tailwindcss" source(none);@source inline("border-solid border border-2 border-0");')
      await writeFile(path.join(root, 'framework.css'), 'uni-app uni-view{position:relative;border-width:medium}')
      await writeFile(path.join(root, 'page.js'), 'import "./page.css";export const page="page"')
      await writeFile(path.join(root, 'page.css'), '.page{color:blue}')
      const namedSources = new Map<string, string>()
      const config: InlineConfig = {
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: WeappTailwindcss({
          appType: 'uni-app-x',
          tailwindcssBasedir: root,
          cssEntries: [path.join(root, 'theme.css')],
          generator: { target: 'web' },
        }),
        build: {
          write: false,
          cssCodeSplit,
          cssMinify,
          rollupOptions: {
            output: {
              assetFileNames(asset) {
                if ((asset.names?.[0] ?? asset.name)?.endsWith('.css')) {
                  const fileName = `assets/style-${digest(asset.source)}.css`
                  namedSources.set(fileName, cssSource(asset.source))
                  return fileName
                }
                return 'assets/[name]-[hash][extname]'
              },
            },
          },
        },
      }
      const result = await buildVite(config) as RollupOutput
      const assets = result.output.filter((output): output is OutputAsset => output.type === 'asset' && output.fileName.endsWith('.css'))
      expect(assets).toHaveLength(cssCodeSplit ? 2 : 1)
      for (const asset of assets) {
        // 使用真实内容命名，防止后置重排悄悄改变已经形成 hash 的资产。
        expect(asset.fileName).toBe(`assets/style-${digest(asset.source)}.css`)
        expect(cssSource(asset.source)).toBe(namedSources.get(asset.fileName))
      }
      const css = String(assets.find(asset => String(asset.source).includes('border-width:medium') || String(asset.source).includes('border-width: medium'))!.source)
      expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeGreaterThan(css.indexOf('medium'))
      expect(css.match(new RegExp(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER, 'g'))).toHaveLength(1)
      expect(css.match(/uni-app uni-ad-draw/g)).toHaveLength(1)
      const references = result.output.map(output => output.type === 'chunk' ? output.code : String(output.source)).join('\n')
      for (const asset of assets) {
        expect(references).toContain(asset.fileName)
      }
      const repeated = await buildVite(config) as RollupOutput
      expect(repeated.output.filter(output => output.type === 'asset' && output.fileName.endsWith('.css')))
        .toEqual(assets)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
