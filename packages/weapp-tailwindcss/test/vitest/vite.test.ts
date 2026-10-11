import type { RollupOutput } from 'rollup'
import type { InlineConfig, Plugin } from 'vite'
import path from 'node:path'
import { defu } from 'defu'
import * as Diff from 'diff'
import prettier from 'prettier'
import { build } from 'vite'
import { WeappTailwindcss as weappTw } from '@/bundlers/vite/index'
// 注意： 打包成 h5 和 app 都不需要开启插件配置
// const isH5 = process.env.UNI_PLATFORM === 'h5'
// const isApp = process.env.UNI_PLATFORM === 'app-plus'
// const WeappTailwindcssDisabled = isH5 || isApp
async function assertSnap(
  plugin?: Plugin | Plugin[] | undefined,
  options?: InlineConfig,
  fn?: (result: RollupOutput) => void,
  normalizeTailwindBanner = false,
) {
  // if (plugin === undefined) {
  //   return
  // }
  const vitePlugins: Plugin[] = []
  // {
  //   name: 'emit-wxml',
  //   transform(code, id) {
  //     console.log(code, id)
  //   }
  //   // load(id,){}
  //   // resolveId: {
  //   //   order: 'pre',
  //   //   handler(source) {
  //   //     if (source.endsWith('wxml')) {
  //   //       return {
  //   //         id: source,
  //   //       }
  //   //     }
  //   //   }
  //   // }
  // }

  if (Array.isArray(plugin)) {
    vitePlugins.push(...plugin.filter(Boolean) as Plugin[])
  }
  else if (plugin) {
    vitePlugins.push(plugin)
  }
  const opts = defu<InlineConfig, InlineConfig[]>(options, {
    root: path.resolve(__dirname, '../fixtures/vite/src'),
    plugins: vitePlugins,
    logLevel: 'silent',
    build: {
      write: false,
    },
  })
  const res = (await build(opts)) as RollupOutput

  if (fn && typeof fn === 'function') {
    fn(res)
  }
  else {
    const output = res.output
    expect(output.length).toBe(3)
    expect(output[0].type).toBe('chunk')
    expect(output[0].code).toMatchSnapshot()
    expect(/\.css$/.test(output[1].fileName)).toBe(true)
    expect(output[1].type).toBe('asset')
    if (output[1].type === 'asset') {
      const r = await prettier.format(output[1].source.toString(), {
        parser: 'css',
      })
      const normalizedCss = normalizeTailwindBanner
        ? r.replace(/\/\*! tailwindcss v[^*]+\*\/\s*/g, '')
        : r
      expect(normalizedCss.replace(/[ \t]+$/gm, '')).toMatchSnapshot()
    }
    expect(/\.html$/.test(output[2].fileName)).toBe(true)
    expect(output[2].type).toBe('asset')
    if (output[2].type === 'asset') {
      const r = await prettier.format(output[2].source.toString(), {
        parser: 'html',
      })
      expect(normalizeHtmlAssetHashes(r)).toMatchSnapshot()
    }
  }
  return res
}

function normalizeHtmlAssetHashes(html: string) {
  return html
    .replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/g, '/assets/index-[hash].js')
    .replace(/\/assets\/index-[A-Za-z0-9_-]+\.css/g, '/assets/index-[hash].css')
}

function htmlMatcher(p: string) {
  return p.endsWith('.html')
}
describe('vite test', () => {
  it('vite common build', async () => {
    let timeStart: number
    let timeTaken: number
    await assertSnap(
      weappTw({
        htmlMatcher,
        onStart() {
          timeStart = performance.now()
        },
        onEnd() {
          timeTaken = performance.now() - timeStart
          // 不会执行
          void timeTaken
        },
      }),
    )
  })

  it('vite common build with rem2rpx', async () => {
    let timeStart: number
    let timeTaken: number
    await assertSnap(
      weappTw({
        htmlMatcher,
        onStart() {
          timeStart = performance.now()
        },
        onEnd() {
          timeTaken = performance.now() - timeStart
          // 不会执行
          void timeTaken
        },
        rem2rpx: true,
      }),
    )
  })

  it('vite common build twice for cache', async () => {
    let timeStart: number
    let timeTaken: number
    const first = await assertSnap(
      weappTw({
        htmlMatcher,
        onStart() {
          timeStart = performance.now()
        },
        onEnd() {
          timeTaken = performance.now() - timeStart
          // 不会执行
          void timeTaken
        },
      }),
      undefined,
      undefined,
      true,
    )
    const second = await assertSnap(
      weappTw({
        htmlMatcher,
        onStart() {
          timeStart = performance.now()
        },
        onEnd() {
          timeTaken = performance.now() - timeStart
          // 不会执行
          void timeTaken
        },
      }),
      undefined,
      undefined,
      true,
    )
    const cssSource = (result: RollupOutput) => result.output
      .filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css'))
      .map(asset => asset.type === 'asset' ? asset.source.toString() : '')
      .join('\n')
    expect(cssSource(first)).toContain('display:flex')
    expect(cssSource(second)).toBe(cssSource(first))
  })

  it('vite disabled build', async () => {
    let timeStart: number
    let timeTaken: number
    await assertSnap(
      weappTw({
        disabled: true,
        htmlMatcher,
        onStart() {
          timeStart = performance.now()
        },
        onEnd() {
          timeTaken = performance.now() - timeStart
          void timeTaken
        },
      }),
    )
  })

  it.skip('source map case 0', async () => {
    await assertSnap(
      weappTw(),
      {
        build: {
          sourcemap: true,
        },
      },
      (res) => {
        const output = res.output
        expect(output.length).toBe(4)
        expect(output[0].type).toBe('chunk')
        expect(output[0].code).toMatchSnapshot()
        expect(output[1].type).toBe('asset')
        if (output[1].type === 'asset') {
          expect(output[1].source).toMatchSnapshot()
        }
        expect(output[2].type).toBe('asset')
        if (output[2].type === 'asset') {
          expect(output[2].source).toMatchSnapshot()
        }
        expect(output[3].type).toBe('asset')
        if (output[3].type === 'asset') {
          expect(output[3].source).toMatchSnapshot()
        }
      },
    )
  })

  it.skip('source map compare case 0', async () => {
    let before: string = ''
    await assertSnap(
      undefined,
      {
        build: {
          sourcemap: true,
        },
      },
      (res) => {
        const output = res.output
        expect(output.length).toBe(4)
        expect(output[2].type).toBe('asset')
        if (output[2].type === 'asset') {
          before = output[2].source.toString()
          expect(before).toMatchSnapshot('before')
        }
      },
    )

    await assertSnap(
      weappTw(),
      {
        build: {
          sourcemap: true,
        },
      },
      (res) => {
        const output = res.output
        expect(output.length).toBe(4)
        expect(output[2].type).toBe('asset')
        if (output[2].type === 'asset') {
          const after = output[2].source.toString()
          expect(after).toMatchSnapshot('after')
          expect(Diff.diffChars(before, after)).toMatchSnapshot('diff')
        }
      },
    )
  })
})
