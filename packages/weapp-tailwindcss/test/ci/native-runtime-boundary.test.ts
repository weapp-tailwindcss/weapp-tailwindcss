import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { insideRuntimeDirectory, inspectNativeRuntime } from './native-runtime-boundary'

const root = path.resolve(import.meta.dirname, '../../../..')

describe('原生运行时依赖闭包', () => {
  it('允许模块拆分与独立纯 JS 值解释入口，保持浏览器可打包和零外部依赖', async () => {
    const report = await inspectNativeRuntime(root)
    expect(report.inputs).toContain(path.join(root, 'packages', 'react-native', 'src', 'runtime', 'line-height.ts'))
    expect(report.inputs).toContain(path.join(root, 'packages', 'postcss', 'src', 'native-runtime.ts'))
    // eslint-disable-next-line no-console -- 在 CI 记录闭包体积，便于审查后续增长。
    console.info(`[native-runtime-boundary] ${JSON.stringify({ sourceBytes: report.sourceBytes, publishedBytes: report.publishedBytes, modules: report.inputs.length })}`)
  })

  it.each(['@weapp-tailwindcss/postcss/native', 'postcss'])('真实引入 CSS 编译入口或 root AST 必须被闭包检查拒绝：%s', async (specifier) => {
    await expect(inspectNativeRuntime(root, specifier)).rejects.toThrow('原生运行时加载了编译依赖')
  })

  it.each(['node:fs', 'weapp-tailwindcss/generator', 'vite', 'webpack'])('运行时不能引入 Node、生成器或构建器：%s', async (specifier) => {
    await expect(inspectNativeRuntime(root, specifier)).rejects.toThrow()
  })

  it('源码目录边界拒绝父目录、相似前缀和跨盘路径，兼容 POSIX/Windows', () => {
    for (const [api, directory] of [[path.posix, '/repo/runtime'], [path.win32, 'C:\\repo\\runtime']] as const) {
      expect(insideRuntimeDirectory(directory, api.join(directory, 'shadow.ts'), api)).toBe(true)
      expect(insideRuntimeDirectory(directory, api.resolve(directory, './resolve.ts'), api)).toBe(true)
      for (const file of [directory, api.dirname(directory), api.resolve(directory, '../compiler.ts'), `${directory}-compiler${api.sep}index.ts`]) {
        expect(insideRuntimeDirectory(directory, file, api)).toBe(false)
      }
    }
    expect(insideRuntimeDirectory('C:\\repo\\runtime', 'D:\\repo\\runtime\\shadow.ts', path.win32)).toBe(false)
    expect(insideRuntimeDirectory('/', '/runtime.ts', path.posix)).toBe(true)
    expect(insideRuntimeDirectory('C:\\', 'C:\\runtime.ts', path.win32)).toBe(true)
  })
})
