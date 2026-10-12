import type { InternalUserDefinedOptions } from '@/types'
import { resolveStyleOptionsFromContext } from '@/context/style-options'

it('同一次解析复用嵌套配置快照，下一次解析仍反映原位修改', () => {
  let reads = 0
  const input: NonNullable<InternalUserDefinedOptions['cssOptions']> = {
    cssCalc: 'auto',
    rem2rpx: true,
  }
  const context = {
    platform: 'mp-weixin',
    tailwindRuntime: { majorVersion: 4 },
    generator: { target: 'weapp' },
    get cssOptions() {
      reads++
      return input
    },
  } as unknown as InternalUserDefinedOptions

  expect(resolveStyleOptionsFromContext(context)).toMatchObject({ cssCalc: 'auto', rem2rpx: true })
  expect(reads).toBe(1)
  input.cssCalc = false
  expect(resolveStyleOptionsFromContext(context).cssCalc).toBe(false)
  expect(reads).toBe(2)
})

it('保留嵌套 WebKit 扩展名单并反映下一次调用的原位修改', () => {
  const properties = ['-webkit-tap-highlight-color']
  const context = {
    generator: { target: 'weapp' },
    cssOptions: { preserveWebkitProperties: properties },
  } as unknown as InternalUserDefinedOptions
  expect(resolveStyleOptionsFromContext(context).cssOptions?.preserveWebkitProperties).toEqual(properties)
  properties.push('-webkit-touch-callout')
  expect(resolveStyleOptionsFromContext(context).cssOptions?.preserveWebkitProperties).toEqual(properties)
})
