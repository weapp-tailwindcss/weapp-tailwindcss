import { LynxCssVariablesPlugin } from '../src/css-variables'

vi.mock('@weapp-tailwindcss/lynx/decoder', () => ({
  lynxDecoderIdentity: () => 'unit-test-decoder',
  decodeLynxBundle: vi.fn(async () => { throw new Error('本轮 decoder 失败') }),
}))

it('实际模板无法解码且没有 encoder warning 时保留未知诊断和构建警告', async () => {
  let beforeEmit: (args: any) => Promise<any>
  let afterEmit: (compilation: any) => Promise<void>
  const onReport = vi.fn()
  const compilation = {
    getAsset: () => ({ source: { source: () => new Uint8Array([1, 2, 3]) } }),
    warnings: [],
    errors: [],
  }
  const plugin = new LynxCssVariablesPlugin({
    getLynxTemplatePluginHooks: () => ({
      beforeEncode: { tap: vi.fn() },
      beforeEmit: { tapPromise: (_name, handler) => { beforeEmit = handler } },
    }),
  }, { strict: true, onReport })
  plugin.apply({ hooks: {
    thisCompilation: { tap: (_name, handler) => handler(compilation) },
    afterEmit: { tapPromise: (_name, handler) => { afterEmit = handler } },
  } })
  await beforeEmit!({ outputName: 'main.lynx.bundle', template: new Uint8Array(), finalEncodeOptions: { css: { cssMap: {} } } })
  await afterEmit!(compilation)
  expect(onReport.mock.calls[0]?.[0].counts.unknown).toBe(1)
  expect(onReport.mock.calls[0]?.[0].evidence.error).toBe('本轮 decoder 失败')
  expect(compilation.warnings).toHaveLength(1)
  expect(compilation.errors).toHaveLength(0)
})
