import { describe, expect, it } from 'vitest'
import { getDefaultOptions } from '@/defaults'
import { createOptionsResolver } from '@/options-resolver'
import { StyleProcessorCache } from '@/processor-cache'

describe('长会话缓存容量', () => {
  it('选项缓存淘汰旧输入但保留最近命中的配置', () => {
    const resolver = createOptionsResolver(getDefaultOptions())
    const hot = { postcssOptions: { options: { from: 'hot.css' } } }
    const cold = { postcssOptions: { options: { from: 'cold.css' } } }
    const hotValue = resolver.resolve(hot)
    const coldValue = resolver.resolve(cold)
    for (let index = 0; index < 254; index++) {
      resolver.resolve({ postcssOptions: { options: { from: `${index}.css` } } })
    }
    expect(resolver.resolve(hot)).toBe(hotValue)
    resolver.resolve({ postcssOptions: { options: { from: 'overflow.css' } } })
    expect(resolver.resolve(hot)).toBe(hotValue)
    expect(resolver.resolve(cold)).not.toBe(coldValue)
  })

  it('处理器及管线在配置持续变化后可以释放旧实例', () => {
    const cache = new StyleProcessorCache()
    const base = getDefaultOptions()
    const first = cache.getProcessor(base)
    const pipeline = cache.getPipeline(base)
    for (let index = 0; index < 64; index++) {
      cache.getProcessor({ ...base, cssSelectorReplacement: { universal: `tag-${index}` } })
    }
    expect(cache.getProcessor(base)).not.toBe(first)
    expect(cache.getPipeline(base)).not.toBe(pipeline)
  })
})
