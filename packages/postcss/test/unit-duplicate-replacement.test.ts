import { applyConfiguredCssUnits } from '@/plugins/applyConfiguredCssUnits'

it('已有目标单位声明不能阻止替换当前声明，也不能改变覆盖顺序', async () => {
  const css = await applyConfiguredCssUnits('.x{--spacing:8rpx;--spacing:2rem;--spacing:.25rem}', { rem2rpx: true })
  expect(css).toBe('.x{--spacing:8rpx;--spacing:64rpx;--spacing:8rpx}')
})

it('显式保留原单位时，不重复插入已有的转换结果', async () => {
  const css = await applyConfiguredCssUnits('.x{width:32rpx;width:1rem}', {
    rem2rpx: { rootValue: 32, transformUnit: 'rpx', propList: ['*'], replace: false },
  })
  expect(css).toBe('.x{width:32rpx;width:1rem}')
})

it('单位转换后仅合并相邻等价声明，保留不同优先级', async () => {
  expect(await applyConfiguredCssUnits('.x{--spacing:8rpx;--spacing:.25rem}', { rem2rpx: true }))
    .toBe('.x{--spacing:8rpx}')
  expect(await applyConfiguredCssUnits('.x{width:32rpx!important;width:1rem}', { rem2rpx: true }))
    .toBe('.x{width:32rpx!important;width:32rpx}')
})
