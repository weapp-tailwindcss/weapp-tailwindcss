import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'
import { createContext } from '@/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')

const taroRoot = path.resolve(repoRoot, 'demo/taro-webpack-react-tailwindcss-v4')
const uniRoot = path.resolve(repoRoot, 'demo/uni-app-vite-tailwindcss-v4')

const taroCssPath = path.resolve(taroRoot, 'dist/app.wxss')
const taroJsPath = path.resolve(taroRoot, 'dist/pages/index/index.js')
const taroWxmlPath = path.resolve(taroRoot, 'dist/pages/index/index.wxml')

const uniCssPath = path.resolve(uniRoot, 'dist/dev/mp-weixin/app.wxss')
const uniJsPath = path.resolve(uniRoot, 'dist/dev/mp-weixin/pages/index/index.js')
const uniWxmlPath = path.resolve(uniRoot, 'dist/dev/mp-weixin/pages/index/index.wxml')

const taroCss = fs.readFileSync(taroCssPath, 'utf8')
const taroJs = fs.readFileSync(taroJsPath, 'utf8')
const taroWxml = fs.readFileSync(taroWxmlPath, 'utf8')

const uniCss = fs.readFileSync(uniCssPath, 'utf8')
const uniJs = fs.readFileSync(uniJsPath, 'utf8')
const uniWxml = fs.readFileSync(uniWxmlPath, 'utf8')

const benchOptions = { time: 260, iterations: 3 }

let taroHotCounter = 0
let uniHotCounter = 0

async function prepareWarmContext(appType: 'taro' | 'uni-app-vite', basedir: string, mainCss: string) {
  const ctx = createContext({
    appType,
    tailwindcssBasedir: basedir,
    logLevel: 'error',
  })
  await ctx.transformWxss(mainCss, { isMainChunk: true })
  return ctx
}

const taroContextPromise = prepareWarmContext('taro', taroRoot, taroCss)
const uniContextPromise = prepareWarmContext('uni-app-vite', uniRoot, uniCss)

function createHotJsSource(source: string, prefix: string, index: number) {
  return `${source}\n/* ${prefix}:${index} */`
}

function createHotWxmlSource(source: string, prefix: string, index: number) {
  return `${source}\n<!-- ${prefix}:${index} -->`
}

test('demo hot-update benchmarks', async ({ bench }) => {
  await bench.compare(
    bench(
      'taro-webpack-react-tailwindcss-v4 hot update (js + wxml, comment-only changes)',
      async () => {
        const iteration = taroHotCounter++
        const ctx = await taroContextPromise
        const jsSource = createHotJsSource(taroJs, 'taro-hot-js', iteration)
        const wxmlSource = createHotWxmlSource(taroWxml, 'taro-hot-wxml', iteration)
        await ctx.transformJs(jsSource, {
          filename: taroJsPath,
        })
        await ctx.transformWxml(wxmlSource)
      },
    ),
    bench(
      'uni-app hot update (js + wxml, comment-only changes)',
      async () => {
        const iteration = uniHotCounter++
        const ctx = await uniContextPromise
        const jsSource = createHotJsSource(uniJs, 'uni-hot-js', iteration)
        const wxmlSource = createHotWxmlSource(uniWxml, 'uni-hot-wxml', iteration)
        await ctx.transformJs(jsSource, {
          filename: uniJsPath,
        })
        await ctx.transformWxml(wxmlSource)
      },
    ),
    benchOptions,
  )
})
