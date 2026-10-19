import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cssDeclarations, retainsDeclarations } from './tailwind-capabilities/css'
import { resolveFixtureFile } from './tailwind-capabilities/fixture'

describe('独立夹具与语义声明边界', () => {
  it('只按完整 class token 归属声明，不能用 flex-col 证明 flex', () => {
    const parsed = cssDeclarations('.flex-col{flex-direction:column}.hover\\:flex:hover{display:flex}')
    expect(parsed.byClass.has('flex')).toBe(false)
    expect(parsed.byClass.get('hover:flex')).toEqual([{ property: 'display', value: 'flex', important: false }])
    expect(retainsDeclarations(parsed.byClass.get('flex-col')!, [{ property: 'display', value: 'flex' }])).toBe(false)
  })

  it('属性值和 important 部分丢失不能通过参考对比', () => {
    const actual = [{ property: 'width', value: '32px', important: false }]
    expect(retainsDeclarations(actual, [{ property: 'width', value: '64px' }])).toBe(false)
    expect(retainsDeclarations(actual, [{ property: 'width', value: '32px', important: true }])).toBe(false)
    expect(retainsDeclarations(actual, [{ property: 'width' }, { property: 'height' }])).toBe(false)
  })

  it('分别按 POSIX 和 Windows 处理根目录、盘符与相对路径', () => {
    expect(resolveFixtureFile('/workspace/fixture', 'pages/probe.tsx', path.posix)).toBe('/workspace/fixture/pages/probe.tsx')
    expect(resolveFixtureFile('C:\\workspace\\fixture', 'pages\\probe.tsx', path.win32)).toBe('C:\\workspace\\fixture\\pages\\probe.tsx')
    for (const [directory, paths] of [['/workspace/fixture', path.posix], ['C:\\workspace\\fixture', path.win32]] as const) {
      for (const file of ['../outside.ts', '/root.ts', 'D:\\root.ts']) {
        expect(() => resolveFixtureFile(directory, file, paths)).toThrow('夹具文件')
      }
    }
    expect(() => resolveFixtureFile('C:\\workspace\\fixture', '..\\outside.ts', path.win32)).toThrow('越过')
  })
})
