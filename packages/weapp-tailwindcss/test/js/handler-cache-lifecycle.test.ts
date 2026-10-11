import type { CreateJsHandlerOptions } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsHandler, jsHandler } from '@/js'
import { defaultJsPreserveClass } from '@/js/default-preserve'

beforeEach(() => {
  vi.stubEnv('WEAPP_TW_NATIVE', 'off')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe.each([false, 'oxc'] as const)('JS %s 回退缓存生命周期', (experimentalJsFastPath) => {
  const source = 'const cls = "hover:bg-red-500 focus:bg-blue-500"'

  it('同一个集合由空变为命中后重新转换，清空后恢复原文', () => {
    const classes = new Set<string>()
    const handler = createJsHandler({ experimentalJsFastPath })
    expect(handler(source, classes).code).toBe(source)
    classes.add('hover:bg-red-500')
    expect(handler(source, classes).code).toContain('hover_cbg-red-500 focus:bg-blue-500')
    classes.clear()
    expect(handler(source, classes).code).toBe(source)
  })

  it('同大小原地替换不能继续转换已移除的候选', () => {
    const classes = new Set(['hover:bg-red-500'])
    const handler = createJsHandler({ experimentalJsFastPath })
    expect(handler(source, classes).code).toContain('hover_cbg-red-500 focus:bg-blue-500')
    classes.delete('hover:bg-red-500')
    classes.add('focus:bg-blue-500')
    expect(handler(source, classes).code).toContain('hover:bg-red-500 focus_cbg-blue-500')
  })

  it.each([undefined, '/fixture/output.js'])('映射原地修改与删除刷新短结果和字符替换缓存：%s', (filename) => {
    const classes = new Set(['hover:bg-red-500'])
    const escapeMap: Record<string, string> = { ':': '_old_' }
    const handler = createJsHandler({ experimentalJsFastPath, escapeMap })
    expect(handler(source, classes, { filename }).code).toContain('hover_old_bg-red-500')
    escapeMap[':'] = '_new_'
    expect(handler(source, classes, { filename }).code).toContain('hover_new_bg-red-500')
    delete escapeMap[':']
    expect(handler(source, classes, { filename }).code).toContain('hover_cbg-red-500')
  })

  it('映射修改后已转义候选匹配使用当前内容', () => {
    const classes = new Set(['hover_new_bg-red-500'])
    const escapeMap = { ':': '_old_' }
    const handler = createJsHandler({ experimentalJsFastPath, escapeMap })
    const override = { filename: '/fixture/output.js' }
    expect(handler(source, classes, override).code).toBe(source)
    escapeMap[':'] = '_new_'
    expect(handler(source, classes, override).code).toContain('hover_new_bg-red-500')
  })

  it('同一个 override 对象原地修改映射和回调后生效', () => {
    const classes = new Set(['hover:bg-red-500'])
    const handler = createJsHandler({ experimentalJsFastPath })
    const override: CreateJsHandlerOptions = { escapeMap: { ':': '_old_' }, jsPreserveClass: () => false }
    expect(handler(source, classes, override).code).toContain('hover_old_bg-red-500')
    override.escapeMap![':'] = '_new_'
    expect(handler(source, classes, override).code).toContain('hover_new_bg-red-500')
    override.jsPreserveClass = () => true
    expect(handler(source, classes, override).code).toBe(source)
  })

  it('不同自定义回调不复用同一短结果', () => {
    const classes = new Set(['hover:bg-red-500'])
    const handler = createJsHandler({ experimentalJsFastPath })
    expect(handler(source, classes, { jsPreserveClass: () => false }).code).toContain('hover_cbg-red-500')
    expect(handler(source, classes, { jsPreserveClass: () => true }).code).toBe(source)
  })

  it('相同回调引用的闭包状态改变后重新决策', () => {
    const classes = new Set(['hover:bg-red-500'])
    let preserve = false
    const jsPreserveClass = vi.fn(() => preserve)
    const handler = createJsHandler({ experimentalJsFastPath, jsPreserveClass })
    expect(handler(source, classes).code).toContain('hover_cbg-red-500')
    preserve = true
    expect(handler(source, classes).code).toBe(source)
    expect(jsPreserveClass.mock.calls.length).toBeGreaterThan(2)
  })

  it('内置星号保留策略与未设置策略不共享结果', () => {
    const handler = createJsHandler({ experimentalJsFastPath })
    const classes = new Set(['*'])
    const star = 'const cls = "*"'
    expect(handler(star, classes).code).toBe('const cls = "_x"')
    expect(handler(star, classes, { jsPreserveClass: defaultJsPreserveClass }).code).toBe(star)
  })

  it('复用 override 时默认映射内容变化仍刷新合并配置', () => {
    const escapeMap = { ':': '_old_' }
    const handler = createJsHandler({ experimentalJsFastPath, escapeMap })
    const classes = new Set(['hover:bg-red-500'])
    const override = { escapeMap: { '[': '_bracket_' } }
    expect(handler(source, classes, override).code).toContain('hover_old_bg-red-500')
    escapeMap[':'] = '_new_'
    expect(handler(source, classes, override).code).toContain('hover_new_bg-red-500')
  })

  it('忽略匹配规则的正则 flags 不互相污染缓存', () => {
    const handler = createJsHandler({ experimentalJsFastPath })
    const classes = new Set(['hover:bg-red-500'])
    const tagged = 'const cls = styled`hover:bg-red-500`'
    expect(handler(tagged, classes, { ignoreTaggedTemplateExpressionIdentifiers: [/STYLED/] }).code).toContain('hover_cbg-red-500')
    expect(handler(tagged, classes, { ignoreTaggedTemplateExpressionIdentifiers: [/STYLED/i] }).code).toBe(tagged)
  })

  it('自定义 Set.has 保留实际查询与副作用，不查询集合快照', () => {
    const run = (factory: boolean) => {
      const classes = new Set(['other'])
      let preserve = false
      const has = vi.fn((value: string) => !preserve && value === 'hover:bg-red-500')
      classes.has = has
      const handler = factory
        ? createJsHandler({ experimentalJsFastPath })
        : (source: string) => jsHandler(source, { experimentalJsFastPath, classNameSet: classes })
      const first = handler(source, classes).code
      const firstCalls = has.mock.calls.slice()
      has.mockClear()
      preserve = true
      const second = handler(source, classes).code
      return { first, second, firstCalls, secondCalls: has.mock.calls }
    }
    expect(run(true)).toEqual(run(false))
  })

  it('映射 getter 的读取次数与 Babel 相同，指纹和快照不额外触发', () => {
    const run = (factory: boolean) => {
      const classes = new Set(['hover:bg-red-500'])
      const escapeMap: Record<string, string> = {}
      const getter = vi.fn(() => '_custom_')
      Object.defineProperty(escapeMap, ':', { enumerable: true, get: getter })
      const handler = factory
        ? createJsHandler({ experimentalJsFastPath, escapeMap })
        : (source: string) => jsHandler(source, { experimentalJsFastPath, escapeMap, classNameSet: classes })
      const first = handler(source, classes).code
      const second = handler(source, classes).code
      return { first, second, reads: getter.mock.calls.length }
    }
    expect(run(true)).toEqual(run(false))
  })
})
