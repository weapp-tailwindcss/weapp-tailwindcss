import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { postcss } from '@weapp-tailwindcss/postcss'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { WeappTailwindcssWeb } from '@/vite-web'

const require = createRequire(new URL('../../../../demo/gulp-tailwindcss-v4/package.json', import.meta.url))
const pxtransform = require('postcss-pxtransform')

const cases = [false, true].flatMap(webCompat => ['inline', 'config-directory'].flatMap(config => ['h5', 'unrelated'].map(pipeline => ({ webCompat, config, pipeline }))))

describe('Vite 首次 CSS 请求的真实框架单位管线', () => {
  it.each(cases)('$pipeline/$config 先消费框架单位，再兜底（webCompat=$webCompat）', async ({ webCompat, config, pipeline }) => {
    vi.stubEnv('TARO_ENV', 'h5')
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'weapp-vite-framework-web-units-')))
    let server: ViteDevServer | undefined
    try {
      await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      const entry = path.join(root, 'entry.css')
      await writeFile(entry, '@import "tailwindcss" source(none);@source inline("p-[16px] text-[32rpx]");.vendor{padding:16px}')
      const directory = path.join(root, 'postcss-config')
      if (config === 'config-directory') {
        await mkdir(directory)
        const plugin = pipeline === 'h5'
          ? `require(${JSON.stringify(require.resolve('postcss-pxtransform'))})({platform:'h5',designWidth:750,deviceRatio:{750:1}})`
          : '{postcssPlugin:"unrelated-framework",Once(){}}'
        await writeFile(path.join(directory, 'postcss.config.cjs'), `module.exports={plugins:[${plugin}]}`)
      }
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        cacheDir: path.join(root, '.vite'),
        plugins: WeappTailwindcssWeb({
          cssEntries: [entry],
          tailwindcssBasedir: root,
          generator: { webCompat, styleOptions: { px2rpx: true } },
          rem2rpx: false,
        }),
        css: {
          postcss: config === 'config-directory'
            ? directory
            : {
                plugins: [pipeline === 'h5'
                  ? pxtransform({ platform: 'h5', designWidth: 750, deviceRatio: { 750: 1 } })
                  : { postcssPlugin: 'unrelated-framework', Once() {} }],
              },
        },
        server: { middlewareMode: true, watch: null },
      })
      const response = await server.transformRequest('/entry.css?direct')
      expect(response).not.toBeNull()
      const values: Record<string, string[]> = { vendor: [], utility: [], fontSize: [] }
      postcss.parse(response!.code).walkRules((rule) => {
        if (rule.selector === '.vendor' || rule.selector.startsWith('.p-')) {
          rule.walkDecls('padding', (declaration) => {
            values[rule.selector === '.vendor' ? 'vendor' : 'utility'].push(declaration.value)
          })
        }
        if (rule.selector.startsWith('.text-')) {
          rule.walkDecls('font-size', (declaration) => {
            values.fontSize.push(declaration.value)
          })
          rule.walkDecls('color', () => {
            throw new Error('rpx 长度候选不能生成颜色声明')
          })
        }
        rule.walkDecls((declaration) => {
          expect(declaration.value).not.toMatch(/\brpx\b|\d+rpx\b/i)
        })
      })
      expect(values.vendor).toEqual([pipeline === 'h5' ? '0.4rem' : '0.5rem'])
      expect(values.utility).toEqual([pipeline === 'h5' ? '0.4rem' : '0.5rem'])
      expect(values.fontSize).toEqual([pipeline === 'h5' ? '0.8rem' : '1rem'])
    }
    finally {
      vi.unstubAllEnvs()
      try {
        await server?.close()
      }
      finally {
        await rm(root, { recursive: true, force: true })
      }
    }
  })
})
