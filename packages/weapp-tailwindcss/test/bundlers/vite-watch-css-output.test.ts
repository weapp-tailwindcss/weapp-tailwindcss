import type { EmittedFile, NormalizedOutputOptions, OutputBundle, PluginContext } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { wrapViteCssPostOutput } from '@/bundlers/vite/watch-css-output'

function handler(hook: any) {
  return typeof hook === 'function' ? hook : hook.handler
}

function fixture() {
  let emissions: EmittedFile[] = []
  let fail = false
  const plugin: Plugin = {
    name: 'vite:css-post',
    generateBundle: {
      order: 'post',
      handler() {
        for (const file of emissions) this.emitFile(file)
        if (fail) throw new Error('framework failed')
      },
    },
  }
  const context = { emitFile: vi.fn(() => 'ref') } as unknown as PluginContext
  const config = { plugins: [plugin] } as ResolvedConfig
  const output = { dir: '/project/out', format: 'es' } as NormalizedOutputOptions
  return {
    plugin, context, config, output,
    setEmissions(files: EmittedFile[]) { emissions = files },
    fail(value: boolean) { fail = value },
    async generate(options = output, write = true, bundle = {} as OutputBundle) {
      vi.mocked(context.emitFile).mockClear()
      await handler(plugin.generateBundle).call(context, options, bundle, write)
      return vi.mocked(context.emitFile).mock.calls.map(([file]) => file)
    },
    async written(options = output) {
      await handler(plugin.writeBundle).call(context, options, {})
    },
  }
}

it('清空整块样式后通过同一产物图覆盖旧资产，并支持恢复和再次删除', async () => {
  const f = fixture()
  expect(wrapViteCssPostOutput(f.config)).toBe(true)
  const file = { type: 'asset', fileName: 'renamed/component.acss', source: '.x{color:red}' } as const
  f.setEmissions([file])
  expect(await f.generate()).toEqual([file])
  await f.written()
  f.setEmissions([])
  expect(await f.generate()).toEqual([{ ...file, source: '' }])
  await f.written()
  expect(await f.generate()).toEqual([])
  f.setEmissions([file])
  await f.generate()
  await f.written()
  f.setEmissions([])
  expect(await f.generate()).toEqual([{ ...file, source: '' }])
})

it('不清空本轮其他生产者提供的同名资产', async () => {
  const f = fixture()
  wrapViteCssPostOutput(f.config)
  f.setEmissions([{ type: 'asset', fileName: 'shared.css', source: '.old{}' }])
  await f.generate()
  await f.written()
  f.setEmissions([])
  const bundle = { 'shared.css': { type: 'asset', fileName: 'shared.css', source: '.current{}', names: [], originalFileNames: [] } } as OutputBundle
  expect(await f.generate(f.output, true, bundle)).toEqual([])
  expect(bundle['shared.css']).toHaveProperty('source', '.current{}')
})

it('框架失败或后续阶段未写盘时，不丢失最后成功产物的归属', async () => {
  const f = fixture()
  wrapViteCssPostOutput(f.config)
  const file = { type: 'asset', fileName: 'view.custom-style', source: '.x{}' } as const
  f.setEmissions([file])
  await f.generate()
  await f.written()
  f.setEmissions([])
  f.fail(true)
  await expect(f.generate()).rejects.toThrow('framework failed')
  f.fail(false)
  expect(await f.generate()).toEqual([{ ...file, source: '' }])
  // 没有 writeBundle，下一轮仍需要清除可能留在磁盘上的旧内容。
  expect(await f.generate()).toEqual([{ ...file, source: '' }])
})

it.each(['/project/out', 'C:\\project\\out', '/', 'out'])('输出 %s 按配置隔离，不把路径当成源文件推导', async (dir) => {
  const f = fixture()
  wrapViteCssPostOutput(f.config)
  const options = { ...f.output, dir }
  f.setEmissions([{ type: 'asset', fileName: 'component.custom', source: '.x{}' }])
  await f.generate(options)
  await f.written(options)
  f.setEmissions([])
  expect(await f.generate({ ...options, file: 'other.js' })).toEqual([])
  expect(await f.generate({ ...options }, false)).toEqual([])
  expect(await f.generate({ ...options })).toEqual([{ type: 'asset', fileName: 'component.custom', source: '' }])
})

it('保留 hook 元数据和其他输出，不重复包装，关闭 watcher 后释放状态', async () => {
  const f = fixture()
  wrapViteCssPostOutput(f.config)
  expect(wrapViteCssPostOutput(f.config)).toBe(false)
  expect(f.plugin.generateBundle).toHaveProperty('order', 'post')
  f.setEmissions([{ type: 'asset', name: 'hashed', source: '.x{}' }, { type: 'chunk', id: 'module' }])
  await f.generate()
  await f.written()
  f.setEmissions([])
  expect(await f.generate()).toEqual([])
  f.setEmissions([{ type: 'asset', fileName: 'old.css', source: '.x{}' }])
  await f.generate()
  await f.written()
  await handler(f.plugin.closeWatcher).call(f.context)
  f.setEmissions([])
  expect(await f.generate()).toEqual([])
})
