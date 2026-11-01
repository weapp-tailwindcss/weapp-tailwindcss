import type { ProcessOptions } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { hasOpaqueProcessOptions } from '../src/process-options-cache-policy'

describe('处理选项快照准入', () => {
  it('未配置、标量及普通 map JSON 可以按数据快照复用', () => {
    expect(hasOpaqueProcessOptions()).toBe(false)
    expect(hasOpaqueProcessOptions({ from: 'a.css', to: 'b.css', map: false })).toBe(false)
    expect(hasOpaqueProcessOptions({ map: { prev: {
      version: 3,
      file: 'a.css',
      names: [],
      sources: ['source.css'],
      sourcesContent: ['.a{color:red}'],
      mappings: 'AAAA',
    } } })).toBe(false)
  })

  it('读取准入不触发访问器，回调也不能被视为静态数据', () => {
    const read = vi.fn(() => postcss.stringify)
    const options: ProcessOptions = {
      get stringifier() {
        return read()
      },
    }
    expect(hasOpaqueProcessOptions(options)).toBe(true)
    expect(read).not.toHaveBeenCalled()
    expect(hasOpaqueProcessOptions({ parser: postcss.parse })).toBe(true)
    expect(hasOpaqueProcessOptions({ map: { annotation: () => 'current.map' } })).toBe(true)
  })

  it('指纹未覆盖的非枚举字段和 symbol 字段不能取得缓存资格', () => {
    const hidden: ProcessOptions = { map: { inline: false } }
    Object.defineProperty(hidden.map, 'annotation', { value: 'current.map', enumerable: false })
    expect(hasOpaqueProcessOptions(hidden)).toBe(true)
    const symbol: ProcessOptions = { map: false }
    Object.defineProperty(symbol, Symbol('state'), { value: 'current' })
    expect(hasOpaqueProcessOptions(symbol)).toBe(true)
  })

  it('数组的稀疏槽或额外字段不能冒充普通 JSON 数组', () => {
    const sources = ['a.css']
    const prev = { version: 3, file: 'out.css', names: [], sources, mappings: 'AAAA' }
    const options = { map: { prev } }
    expect(hasOpaqueProcessOptions(options)).toBe(false)
    Object.defineProperty(sources, 'state', { value: 'hidden' })
    expect(hasOpaqueProcessOptions(options)).toBe(true)
    const sparse: string[] = []
    sparse.length = 2
    expect(hasOpaqueProcessOptions({ map: { prev: { ...prev, sources: sparse } } })).toBe(true)
  })

  it('数组子类和自定义数组原型不能隐藏继承状态', () => {
    class Sources extends Array<string> {
      toJSON() {
        return ['dynamic.css']
      }
    }
    const prev = { version: 3, file: 'out.css', names: [], sources: new Sources('stable.css'), mappings: 'AAAA' }
    expect(hasOpaqueProcessOptions({ map: { prev } })).toBe(true)
    const sources = ['stable.css']
    Object.setPrototypeOf(sources, { toJSON: () => ['dynamic.css'] })
    expect(hasOpaqueProcessOptions({ map: { prev: { ...prev, sources } } })).toBe(true)
    expect(hasOpaqueProcessOptions({ map: { prev: { ...prev, sources: ['stable.css'] } } })).toBe(false)
  })
})
