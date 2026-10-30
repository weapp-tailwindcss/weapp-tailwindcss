import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('HBuilderX 模板以完整路径数组传递已导入的 Tailwind CSS 入口', async () => {
  const root = fileURLToPath(new URL('../templates/uni-app-hbuilderx-tailwindcss-v4/', import.meta.url))
  const configFile = path.join(root, 'vite.config.ts')
  const source = await readFile(configFile, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: configFile,
  })
  let options: { tailwindcss?: { v4?: { cssEntries?: unknown } } } | undefined
  const module = { exports: {} }
  runInNewContext(compiled.outputText, {
    __dirname: root,
    exports: module.exports,
    module,
    require(id: string) {
      if (id === 'vite') {
        return { defineConfig: (config: unknown) => config }
      }
      if (id === '@dcloudio/vite-plugin-uni') {
        return () => ({ name: 'uni-fixture' })
      }
      if (id === 'weapp-tailwindcss/vite') {
        return {
          WeappTailwindcss(value: typeof options) {
            options = value
          },
        }
      }
      if (id === 'path' || id === 'node:path') {
        return path
      }
      throw new Error(`未声明的模板配置依赖：${id}`)
    },
  }, { filename: configFile, timeout: 1000 })

  const entries = options?.tailwindcss?.v4?.cssEntries
  expect(Array.isArray(entries), '标量路径会被逐字符扫描，不能作为 CSS 入口列表').toBe(true)
  expect(entries).toEqual([path.join(root, 'main.css')])
  for (const entry of entries as string[]) {
    expect((await stat(entry)).isFile()).toBe(true)
    expect(await readFile(entry, 'utf8')).toContain('@import "tailwindcss"')
  }
  expect(await readFile(path.join(root, 'main.js'), 'utf8')).toContain('import \'./main.css\'')
})
