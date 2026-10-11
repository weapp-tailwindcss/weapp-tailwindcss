import { createStyleHandler } from '@/handler'

const source = ':root{--brand:#123456}.component{color:var(--brand,#000);height:var(--height,32rpx)}'

it('调用时首次引入嵌套 CSS 配置，不丢失禁止全局变量展开的默认值', async () => {
  const handler = createStyleHandler({ majorVersion: 4 })
  const options = { cssOptions: { cssCalc: false, rem2rpx: false, cssPresetEnv: undefined } }
  const plain = await handler(source)
  const overridden = await handler(source, options)
  expect(overridden.css).toBe(plain.css)
  expect(overridden.css).not.toMatch(/color:\s*#123456/)
  expect(overridden.css).not.toMatch(/height:\s*32rpx/)
})

it('嵌套部分 preset 继续合入默认值，同时尊重显式变量展开', async () => {
  const handler = createStyleHandler({ majorVersion: 4 })
  const safe = await handler(source, { cssOptions: { cssPresetEnv: { features: { 'nesting-rules': false } } } })
  expect(safe.css).not.toMatch(/color:\s*#123456/)
  const explicit = await handler(source, { cssOptions: { cssPresetEnv: { features: { 'custom-properties': { preserve: true } } } } })
  expect(explicit.css).toMatch(/color:\s*#123456/)
  expect(explicit.css).toContain('var(--brand')
})
