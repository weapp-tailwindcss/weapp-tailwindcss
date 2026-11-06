import type { IStyleHandlerOptions } from '../src/types'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '../src/handler'
import { StyleProcessorCache } from '../src/processor-cache'

describe('样式目标查询', () => {
  it('查询不构建管线，并与真实管线共享平台配置解析', () => {
    const build = vi.spyOn(StyleProcessorCache.prototype, 'getPipeline')
    try {
      const handler = createStyleHandler({ majorVersion: 4, appType: 'mpx', platform: 'mp-weixin' })
      const overrides: Partial<IStyleHandlerOptions>[] = [
        {},
        { platform: 'h5' },
        { cssOptions: { platform: 'web' } },
        { uniAppX: true, uniAppXCssTarget: 'uvue' },
        { cssOptions: { platform: 'mp-alipay' } },
      ]
      const targets = overrides.map(options => handler.getTarget!(options))
      expect(build).not.toHaveBeenCalled()
      expect(targets).toEqual(overrides.map(options => handler.getPipeline(options).target))
      const mutable = { cssOptions: { platform: 'h5' } }
      expect(handler.getTarget!(mutable)).toBe('web')
      mutable.cssOptions.platform = 'mp-weixin'
      expect(handler.getTarget!(mutable)).toBe('mini-program')
    }
    finally {
      build.mockRestore()
    }
  })
})
