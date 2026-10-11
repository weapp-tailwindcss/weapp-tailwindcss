import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePackageBin } from './package-cli'

describe('临时工程的包 CLI 入口', () => {
  it.each([
    { paths: path.posix, manifest: '/workspace/packages/uni/package.json', bin: 'bin/uni.js', expected: '/workspace/packages/uni/bin/uni.js' },
    { paths: path.posix, manifest: '/package.json', bin: './bin/uni.js', expected: '/bin/uni.js' },
    { paths: path.win32, manifest: 'C:\\workspace\\packages\\uni\\package.json', bin: 'bin/uni.js', expected: 'C:\\workspace\\packages\\uni\\bin\\uni.js' },
    { paths: path.win32, manifest: 'D:\\package.json', bin: '.\\bin\\uni.js', expected: 'D:\\bin\\uni.js' },
    { paths: path.win32, manifest: 'C:\\repo\\package.json', bin: '..\\uni\\bin\\uni.js', expected: 'C:\\uni\\bin\\uni.js' },
  ])('按包目录解析 $manifest 的 $bin', ({ paths, manifest, bin, expected }) => {
    expect(resolvePackageBin(manifest, { bin: { uni: bin } }, 'uni', paths)).toBe(expected)
    expect(resolvePackageBin(manifest, { bin }, 'uni', paths)).toBe(expected)
  })

  it('缺失入口时明确失败，不从 PATH 借用另一份 CLI', () => {
    expect(() => resolvePackageBin('/repo/package.json', { bin: { other: 'cli.js' } }, 'uni', path.posix)).toThrow('没有声明 uni')
  })
})
