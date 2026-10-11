import type { ExpectStatic } from 'vitest'
import { describe, it } from 'vitest'

export interface ScanContractAdapter {
  matches: (file: string, entries: Array<{ base: string, pattern: string, negated: boolean }>) => unknown
  resolveEntry: (source: string, base: string, negated: boolean, pattern?: string) => Promise<{ base: string, pattern: string, negated: boolean }>
}

/** 各入口共用的路径与来源匹配契约，预期独立于生产实现。 */
export function sourceScanContract(name: string, api: ScanContractAdapter, expect: ExpectStatic) {
  describe(`${name} 共享扫描语义`, () => {
    it.each([
      { base: '/project', file: '/project/src/page.qxml', pattern: 'src/**/*.qxml', expected: true },
      { base: '/project', file: '/elsewhere/src/page.qxml', pattern: 'src/**/*.qxml', expected: false },
      { base: 'C:\\project', file: 'C:\\project\\src\\中文 页面.qxml', pattern: 'src/**/*.qxml', expected: true },
      { base: 'C:\\project', file: 'D:\\project\\src\\page.qxml', pattern: 'src/**/*.qxml', expected: false },
      { base: 'C:\\project', file: 'C:\\project\\src\\page.qxml', pattern: 'C:\\project\\src\\**\\*.qxml', expected: true },
      {"base": "C:\\project", "file": "C:\\project\\src\\page.qxml", "pattern": "src\\**\\*.qxml", "expected": true},
      {"base": "\\\\server\\share", "file": "\\\\server\\share\\src\\page.qxml", "pattern": "src/**/*.qxml", "expected": true},
      {"base": "/project", "file": "/project/src/../src/中文 页面.qxml", "pattern": "./src/**/*.qxml", "expected": true},
      {"base": "C:\\", "file": "C:\\src\\page.qxml", "pattern": "src/**/*.qxml", "expected": true},
      { base: '/', file: '/src/page.qxml', pattern: 'src/**/*.qxml', expected: true },
      { base: '/project', file: '/project/src/[page].qxml', pattern: 'src/\\[page\\].qxml', expected: true },
    ])('匹配 $file / $pattern', ({ base, file, pattern, expected }) => {
      expect(Boolean(api.matches(file, [{ base, pattern, negated: false }]))).toBe(expected)
    })
    it('排除规则优先且不扩大来源根', () => {
      const sources = [
        { base: '/project', pattern: 'src/**/*.qxml', negated: false },
        { base: '/project', pattern: 'src/private/**', negated: true },
      ]
      expect(Boolean(api.matches('/project/src/private/a.qxml', sources))).toBe(false)
      expect(Boolean(api.matches('/project/src/a.qxml', sources))).toBe(true)
      expect(Boolean(api.matches('/project/vendor/a.qxml', sources))).toBe(false)
    })
    it('绝对 glob 保留静态根与相对模式', async () => {
      expect(await api.resolveEntry('/project/src/**/*.qxml', '/elsewhere', false)).toEqual({
        base: '/project/src', pattern: '**/*.qxml', negated: false,
      })
    })
    it('POSIX 来源中的 glob 转义不改变目录身份', async () => {
      for (const source of ['src/\\[page\\].qxml', '/project/src/\\[page\\].qxml']) {
        expect(await api.resolveEntry(source, '/project', false)).toEqual({
          base: '/project/src', pattern: '\\[page\\].qxml', negated: false,
        })
      }
    })
  })
}
