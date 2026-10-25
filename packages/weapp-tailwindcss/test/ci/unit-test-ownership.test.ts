import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyTestOwnership, viteIntegrationFile } from '../../../../scripts/ci/unit-test-ownership.mjs'

describe('单测与 Vite 集成测试的文件所有权', () => {
  it.each([
    { platform: 'POSIX', paths: path.posix, root: '/workspace/repo' },
    { platform: 'Windows 盘符', paths: path.win32, root: 'D:\\workspace\\repo' },
    { platform: 'Windows 根目录', paths: path.win32, root: '\\workspace\\repo' },
  ])('$platform 下按项目与文件身份保留全集并拒绝重复或缺失', ({ paths, root }) => {
    const target = { projectName: 'weapp-tailwindcss', file: paths.resolve(root, viteIntegrationFile) }
    const css = { projectName: 'weapp-tailwindcss', file: paths.resolve(root, 'packages', 'weapp-tailwindcss', 'test', 'postcss.test.ts') }
    const otherProject = { ...css, projectName: 'another-project' }
    const all = [target, css, otherProject]
    expect(verifyTestOwnership(all, [[css], [otherProject], []], [target], root, paths))
      .toEqual({ total: 3, shards: [1, 1, 0], integration: 1 })
    expect(() => verifyTestOwnership(all, [[css], [otherProject], [target]], [target], root, paths))
      .toThrow('测试文件重复归属')
    expect(() => verifyTestOwnership(all, [[css], [], []], [target], root, paths))
      .toThrow('遗漏默认测试文件')
  })

  it('同一项目的绝对与相对路径不能绕过重复归属检查', () => {
    const root = '/workspace/repo'
    const target = { projectName: 'weapp-tailwindcss', file: viteIntegrationFile }
    const duplicate = { ...target, file: path.posix.resolve(root, viteIntegrationFile) }
    expect(() => verifyTestOwnership([target], [[duplicate], [], []], [target], root, path.posix))
      .toThrow('测试文件重复归属')
  })

  it('Windows 的逻辑斜杠与文件系统反斜杠对应同一测试身份', () => {
    const root = 'C:\\workspace\\repo'
    const target = { projectName: 'weapp-tailwindcss', file: `C:/workspace/repo/${viteIntegrationFile}` }
    const duplicate = { ...target, file: path.win32.resolve(root, viteIntegrationFile) }
    expect(() => verifyTestOwnership([target], [[duplicate], [], []], [target], root, path.win32))
      .toThrow('测试文件重复归属')
  })

  it('Vite 作业必须只执行目标文件，不能执行空集合或其他文件', () => {
    const target = { file: viteIntegrationFile }
    const css = { file: 'packages/weapp-tailwindcss/test/postcss.test.ts' }
    for (const integration of [[], [css], [target, css]]) {
      expect(() => verifyTestOwnership([target, css], [[css], [], []], integration, '/repo', path.posix))
        .toThrow('必须精确执行原版本矩阵文件')
    }
  })

  it('不能静默接受额外文件、重复清单或错误分片数量', () => {
    const target = { file: viteIntegrationFile }
    const css = { file: 'packages/weapp-tailwindcss/test/postcss.test.ts' }
    expect(() => verifyTestOwnership([target], [[css], [], []], [target], '/repo', path.posix))
      .toThrow('默认集合之外')
    expect(() => verifyTestOwnership([target, target], [[], [], []], [target], '/repo', path.posix))
      .toThrow('存在重复')
    expect(() => verifyTestOwnership([target, css], [[css, css], [], []], [target], '/repo', path.posix))
      .toThrow('存在重复')
    expect(() => verifyTestOwnership([target], [[], []], [target], '/repo', path.posix))
      .toThrow('必须保留三个分片')
  })

  it.each([
    { all: [] },
    { all: [{ file: 'packages/other/test.spec.ts' }] },
    { all: [{ file: viteIntegrationFile, projectName: 'first' }, { file: viteIntegrationFile, projectName: 'second' }] },
  ])('默认集合必须包含唯一版本矩阵身份：$all', ({ all }) => {
    expect(() => verifyTestOwnership(all, [[], [], []], [], '/repo', path.posix)).toThrow()
  })

  it.each([
    { paths: path.posix, root: '/repo', file: '../outside.test.ts' },
    { paths: path.win32, root: 'C:\\repo', file: 'D:\\outside.test.ts' },
    { paths: path.win32, root: 'C:\\repo', file: '..\\outside.test.ts' },
  ])('拒绝仓库外的文件身份：$file', ({ paths, root, file }) => {
    expect(() => verifyTestOwnership([{ file }], [[], [], []], [], root, paths)).toThrow('必须属于仓库')
  })
})
