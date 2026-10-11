import { parseSync } from '@babel/core'
import { rollup } from 'rollup'
import { expect, it } from 'vitest'
import { compileScript } from '../precompile-script.mjs'
import { disabled, frameworkCompatibility } from '../capture.cjs'

const parsingCompiler = { transformJavaScript(source, snapshot, options) {
  try { parseSync(source, { configFile: false, babelrc: false, parserOpts: options.babelParserOptions }); return { code: source } }
  catch (error) { return { code: source, error } }
} }

it('静态预编译按源码语法解析 JSX、TSX、TypeScript 和 SFC script，不丢弃类型或 JSX', async () => {
  for (const [file, source, language] of [
    ['page.jsx', 'const Page = () => <View className="h-[64rpx]"/>'],
    ['page.tsx', 'const Page = (n: number) => <View className="h-[64rpx]">{n}</View>'],
    ['page.ts', 'const value = <number>1'],
    ['/project/page.tsx', 'const Page = (n: number) => <View>{n}</View>'],
    ['C:\\project\\page.tsx', 'const Page = (n: number) => <View>{n}</View>'],
    ['C:\\page.ts', 'const value = <number>1'],
    ['page.vue', 'const value: number = 1', 'ts'],
    ['page.vue', 'const Page = (n: number) => <View>{n}</View>', 'tsx'],
  ]) expect(await compileScript(parsingCompiler, source, {}, file, language)).toBe(source)
})

it('发布转换器返回解析错误时立即阻断，不把未转换源码写成静态成功基线', async () => {
  const error = new SyntaxError('invalid source')
  await expect(compileScript({ transformJavaScript: () => ({ code: 'unchanged', error }) }, 'unchanged', {}, 'page.tsx'))
    .rejects.toMatchObject({ message: '静态源码转换失败：page.tsx', cause: error })
  await expect(compileScript(parsingCompiler, 'const =', {}, 'page.ts')).rejects.toThrow('静态源码转换失败')
})

it('Taro Alipay 基线在真实 bundler 生命周期中保留框架资产，其他平台不额外处理', async () => {
  const records = [{ key: 'options', value: { module: 'weapp-tailwindcss/vite', options: { appType: 'taro' }, environment: { TARO_ENV: 'alipay' } } }]
  const plugins = disabled('WeappTailwindcss', records, '', '', 'weapp-tailwindcss/vite')()
  expect(frameworkCompatibility(records)).toEqual(['taro-alipay-browserslist'])
  expect(plugins).toHaveLength(1)
  expect(plugins[0].enforce).toBe('pre')
  const generate = async compatibility => {
    const build = await rollup({ input: 'entry', plugins: [
      { name: 'fixture', resolveId: id => id, load: () => 'export const fixture = 1' }, ...compatibility,
      { name: 'taro-asset-consumer', generateBundle(options, bundle) {
        // Taro 对既有资产的改写要求前序 hook 已将该文件纳入产物图。
        expect(bundle['.browserslistrc'].type).toBe('asset')
        bundle['.browserslistrc'].source = 'defaults and fully supports es6-module'
      } },
    ] })
    try { return await build.generate({ format: 'es' }) }
    finally { await build.close() }
  }
  await expect(generate([])).rejects.toThrow()
  const result = await generate(plugins)
  expect(result.output.find(asset => asset.fileName === '.browserslistrc').source).toBe('defaults and fully supports es6-module')
  records[0].value.environment.TARO_ENV = 'weapp'
  expect(frameworkCompatibility(records)).toEqual([])
  expect(disabled('WeappTailwindcss', records, '', '', 'weapp-tailwindcss/vite')()).toEqual([])
  expect(disabled('WeappTailwindcss', records, '', '', 'weapp-tailwindcss/webpack')()).toHaveProperty('apply')
})
