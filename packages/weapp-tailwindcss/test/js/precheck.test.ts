import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldSkipViteJsTransform } from '@/bundlers/vite/js-precheck'
import { hasDependencyHint, shouldSkipJsTransform } from '@/js/precheck'

describe('shouldSkipJsTransform', () => {
  describe('空字符串返回 true（可跳过）', () => {
    it('空字符串', () => {
      expect(shouldSkipJsTransform('')).toBe(true)
    })
  })

  describe('纯数字/无类名模式的代码返回 true', () => {
    it('纯数字赋值', () => {
      expect(shouldSkipJsTransform('const answer = 42')).toBe(true)
    })

    it('简单算术表达式', () => {
      expect(shouldSkipJsTransform('const sum = 1 + 2 + 3')).toBe(true)
    })

    it('无类名模式的函数', () => {
      expect(shouldSkipJsTransform('function add(a, b) { return a + b }')).toBe(true)
    })
  })

  describe('含类名相关关键字的代码返回 false', () => {
    it.each([
      ['className', 'el.className = "flex"'],
      ['classList', 'el.classList.add("hidden")'],
      ['twMerge', 'twMerge("p-4", "p-2")'],
      ['clsx', 'clsx("flex", active && "bg-red")'],
      ['classnames', 'classnames("a", "b")'],
      ['cn', 'cn("flex", "items-center")'],
      ['cva', 'cva("base", { variants: {} })'],
    ])('%s', (_label, code) => {
      expect(shouldSkipJsTransform(code)).toBe(false)
    })
  })

  describe('含 Tailwind 任意值语法的代码返回 false', () => {
    it('text-[', () => {
      expect(shouldSkipJsTransform('const cls = "text-[#123456]"')).toBe(false)
    })

    it('bg-[', () => {
      expect(shouldSkipJsTransform('const cls = "bg-[url(img.png)]"')).toBe(false)
    })
  })

  describe('classNameSet 精确预筛', () => {
    const options = {
      classNameSet: new Set(['w-[100px]', 'text-[#123456]']),
      unescapeUnicode: true,
    }

    it('命中单引号、双引号和模板片段时保留转换', () => {
      expect(shouldSkipJsTransform(`const a = 'w-[100px]'; const b = "text-[#123456]"; const c = \`w-[100px]\``, options)).toBe(false)
    })

    it('源码只有 className 标识符但没有集合命中时跳过 AST', () => {
      expect(shouldSkipJsTransform('const className = getClassName(); const value = "business-value"', options)).toBe(true)
    })

    it('无启发式前缀的普通类名仍然命中集合', () => {
      expect(shouldSkipJsTransform('const cls = "button"', {
        ...options,
        classNameSet: new Set(['button']),
      })).toBe(false)
    })

    it('支持 Unicode 转义和已转义集合成员', () => {
      expect(shouldSkipJsTransform('const cls = "w-\\u005b100px\\u005d"', options)).toBe(false)
      expect(shouldSkipJsTransform('const cls = "w-[100px]"', {
        ...options,
        classNameSet: new Set(['w-_b100px_B']),
      })).toBe(false)
    })

    it('支持数字开头、负数字开头和 Unicode 的已转义类名', () => {
      expect(shouldSkipJsTransform('const a = "123"', {
        ...options,
        classNameSet: new Set(['_123']),
      })).toBe(false)
      expect(shouldSkipJsTransform('const b = "-2xl"', {
        ...options,
        classNameSet: new Set(['_-2xl']),
      })).toBe(false)
      expect(shouldSkipJsTransform('const c = "中文"', {
        ...options,
        classNameSet: new Set(['u_x4e2d_u_x6587_']),
      })).toBe(false)
    })

    it('空集合保持原有启发式行为', () => {
      expect(shouldSkipJsTransform('const className = value', { classNameSet: new Set() })).toBe(false)
    })

    it('生产路径中未命中集合的静态依赖可以跳过 AST', () => {
      expect(shouldSkipJsTransform('import { helper } from "module"; const value = helper()', options)).toBe(true)
    })

    it('module graph 路径保留未命中集合的依赖分析', () => {
      expect(shouldSkipJsTransform('import { helper } from "module"; const value = helper()', {
        ...options,
        moduleGraph: {} as never,
      })).toBe(false)
    })

    it('Babel 路径不使用 classNameSet 预筛跳过 handler', () => {
      expect(shouldSkipJsTransform('const className = "business-value"', {
        ...options,
        experimentalJsFastPath: false,
      })).toBe(false)
    })

    it.each([
      { experimentalJsFastPath: false as const },
      { moduleGraph: {} as never },
    ])('不消费精确预筛结果的路径不读取转义映射：%j', (overrides) => {
      const readEscapeMap = vi.fn(() => ({ '[': '_L', ']': '_R' }))
      const current = {
        ...options,
        ...overrides,
        get escapeMap() {
          return readEscapeMap()
        },
      }
      expect(shouldSkipJsTransform('const className = "business-value"', current)).toBe(false)
      expect(shouldSkipJsTransform('import { value } from "module"', current)).toBe(false)
      expect(shouldSkipJsTransform('const value = "business-value"', current)).toBe(true)
      expect(readEscapeMap).not.toHaveBeenCalled()
    })
  })

  describe('含 import/export/require 语句的代码返回 false', () => {
    it('import 语句（命名导入）', () => {
      expect(shouldSkipJsTransform('import { foo } from "bar"')).toBe(false)
    })

    it('import 语句（字符串导入）', () => {
      expect(shouldSkipJsTransform('import "bar"')).toBe(false)
    })

    it('import 语句（星号导入）', () => {
      expect(shouldSkipJsTransform('import * as bar from "baz"')).toBe(false)
    })

    it('Webpack harmony import 注释不会误判为依赖', () => {
      const source = '/* harmony import */ var className = getName()'
      expect(hasDependencyHint(source)).toBe(false)
    })

    it('dynamic import 与 JSDoc import type 不会误判为静态模块图依赖', () => {
      expect(hasDependencyHint('const lazy = import("./lazy")')).toBe(false)
      expect(hasDependencyHint('/** @returns {import("@mpxjs/core").Mpx} */')).toBe(false)
      expect(shouldSkipJsTransform('const lazy = import("./lazy")')).toBe(true)
    })

    it('export 语句', () => {
      expect(shouldSkipJsTransform('export * from "module"')).toBe(false)
    })

    it('require 调用', () => {
      expect(shouldSkipJsTransform('const m = require("mod")')).toBe(false)
    })

    it('export { } from 语句', () => {
      expect(shouldSkipJsTransform('export { foo } from "bar"')).toBe(false)
    })
  })

  describe('选项强制不跳过', () => {
    it('alwaysEscape: true 时返回 false', () => {
      expect(shouldSkipJsTransform('const x = 1', { alwaysEscape: true })).toBe(false)
    })

    it('moduleSpecifierReplacements 有条目时返回 false', () => {
      expect(shouldSkipJsTransform('const x = 1', {
        moduleSpecifierReplacements: { './a': './b' },
      })).toBe(false)
    })

    it('wrapExpression: true 时返回 false', () => {
      expect(shouldSkipJsTransform('const x = 1', { wrapExpression: true })).toBe(false)
    })
  })

  describe('环境变量 WEAPP_TW_DISABLE_JS_PRECHECK', () => {
    afterEach(() => {
      delete process.env.WEAPP_TW_DISABLE_JS_PRECHECK
    })

    it('设置为 "1" 时返回 false', () => {
      process.env.WEAPP_TW_DISABLE_JS_PRECHECK = '1'
      expect(shouldSkipJsTransform('const x = 1')).toBe(false)
    })

    it('未设置时正常执行预检查', () => {
      expect(shouldSkipJsTransform('const x = 1')).toBe(true)
    })
  })

  describe('re-export 兼容性', () => {
    it('shouldSkipViteJsTransform 与 shouldSkipJsTransform 行为一致', () => {
      const cases = [
        '',
        'const x = 42',
        'el.className = "flex"',
        'import foo from "bar"',
        'const cls = "text-[#fff]"',
      ]
      for (const code of cases) {
        expect(shouldSkipViteJsTransform(code)).toBe(shouldSkipJsTransform(code))
      }
    })
  })
})
