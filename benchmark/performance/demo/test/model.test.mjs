import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { difference, modes, order, selectCases, statistics, weeklyMatrix } from '../model.mjs'
import { inside, withoutIntegration } from '../published.mjs'
import { regression } from '../gate.mjs'
import { relativeSpecifier, rewriteConfiguration } from '../configs.mjs'
import { disabled } from '../capture.cjs'

describe('周报数据边界', () => {
  it('禁用适配保留 Webpack 工厂与 Vite 插件集合契约', () => {
    expect(disabled('StyleInjector', [], '', '', 'weapp-style-injector/webpack/mpx')()).toHaveProperty('apply')
    expect(disabled('WeappTailwindcss', [], '', '', 'weapp-tailwindcss/vite')()).toEqual([])
    const Plugin = disabled('WeappTailwindcss', [], '', '', 'weapp-tailwindcss/webpack')
    expect(new Plugin()).toHaveProperty('apply')
  })
  it('复用完整清单，拒绝拼错和重复的目标', () => {
    expect(selectCases()).toHaveLength(107)
    expect(weeklyMatrix().include).toHaveLength(159)
    expect(() => selectCases('missing')).toThrow('未知目标')
    const id = selectCases()[0].id
    expect(() => selectCases(`${id},${id}`)).toThrow('重复目标')
  })
  it('三轮平衡顺序，每次包含全部模式', () => {
    const rounds = [0, 1, 2].map(index => order(index))
    for (let position = 0; position < 3; position++) expect(new Set(rounds.map(row => row[position]))).toEqual(new Set(modes))
    expect(order(1, true)).toEqual(order(1).reverse())
  })
  it('无数据与零基线不伪装成零开销，改善保留负数', () => {
    expect(statistics([])).toBeNull()
    expect(statistics([1, NaN])).toBeNull()
    expect(difference(0, 20)).toEqual({ absolute: 20, percent: null })
    expect(difference(100, 80)).toEqual({ absolute: -20, percent: -20 })
    expect(difference(null, 20)).toBeNull()
  })
  it('相对、绝对、统计证据同时满足才确认退化', () => {
    expect(regression(Array(7).fill(100), Array(7).fill(106), 'build.cold')).toBe(false)
    expect(regression(Array(7).fill(1000), Array(7).fill(1040), 'build.cold')).toBe(false)
    expect(regression(Array(7).fill(100), Array(7).fill(150), 'build.cold')).toBe(true)
    expect(regression(Array(7).fill(100), [150, 150, 150, 90, 90, 90, 90], 'build.cold')).toBe(false)
  })
  it('原生组只移除构建接入，保留仍被页面消费的运行时', () => {
    const manifest = { dependencies: { 'weapp-tailwindcss': '5.5.11', '@weapp-tailwindcss/merge': '1.0.0', vue: '3.5.0' } }
    expect(withoutIntegration(manifest).dependencies).toEqual({ '@weapp-tailwindcss/merge': '1.0.0', vue: '3.5.0' })
    expect(manifest.dependencies['weapp-tailwindcss']).toBe('5.5.11')
  })
  it('文件系统路径边界支持盘符、根目录和相对路径', () => {
    expect(inside('/a', '/a/node_modules/pkg', path.posix)).toBe(true)
    expect(inside('/a', '/ab/pkg', path.posix)).toBe(false)
    expect(inside('/a', '/a/../pkg', path.posix)).toBe(false)
    expect(inside('C:\\a', 'C:\\a\\node_modules\\pkg', path.win32)).toBe(true)
    expect(inside('C:\\a', 'D:\\a\\pkg', path.win32)).toBe(false)
    expect(inside('C:\\', 'C:\\a', path.win32)).toBe(true)
    expect(inside('project', 'project/node_modules', path.posix)).toBe(true)
  })
  it('仅改写模块导入，不改写业务文本或注释', async () => {
    const source = `import { WeappTailwindcss, type Options } from 'weapp-tailwindcss/vite'\nconst text = 'weapp-tailwindcss/vite'\n// weapp-tailwindcss/vite\n`
    const result = await rewriteConfiguration(source, 'vite.config.ts', () => './capture.cjs')
    expect(result).toContain('from "./capture.cjs"')
    expect(result).toContain("const text = 'weapp-tailwindcss/vite'")
    expect(result).toContain('// weapp-tailwindcss/vite')
  })
  it('隐藏目录不是裸模块名，捕获导入必须带相对路径前缀', () => {
    expect(relativeSpecifier('/demo/gulpfile.ts', '/demo/.cost/module.cjs', path.posix)).toBe('./.cost/module.cjs')
    expect(relativeSpecifier('/demo/config/index.ts', '/demo/.cost/module.cjs', path.posix)).toBe('../.cost/module.cjs')
    expect(relativeSpecifier('C:\\demo\\gulpfile.ts', 'C:\\demo\\.cost\\module.cjs', path.win32)).toBe('./.cost/module.cjs')
    expect(() => relativeSpecifier('C:\\demo\\gulpfile.ts', 'D:\\module.cjs', path.win32)).toThrow('同一文件系统根目录')
  })
})
