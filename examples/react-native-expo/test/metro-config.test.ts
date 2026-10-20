import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(import.meta.dirname, '..')

it('Metro 直接消费静态归档共用的单入口选项，并保留共享目录监听', () => {
  const input = require('../tailwind-input.cjs')
  const config = { watchFolders: [path.resolve(projectRoot, 'existing-source')] }
  const withWeappTailwindcss = vi.fn((value, options) => ({ value, options }))
  const module = { exports: undefined }
  runInNewContext(readFileSync(path.join(projectRoot, 'metro.config.js'), 'utf8'), {
    __dirname: projectRoot,
    module,
    require: (id: string) => {
      if (id === 'node:path') {
        return path
      }
      if (id === '@weapp-tailwindcss/react-native/metro') {
        return { withWeappTailwindcss }
      }
      if (id === 'expo/metro-config') {
        return { getDefaultConfig: (root: string) => {
          expect(root).toBe(projectRoot)
          return config
        } }
      }
      if (id === './tailwind-input.cjs') {
        return input
      }
      throw new Error(`Metro 配置读取了未登记依赖：${id}`)
    },
  })
  expect(withWeappTailwindcss).toHaveBeenCalledExactlyOnceWith(config, input)
  expect(module.exports).toEqual({ value: config, options: input })
  expect(input.input).toBe('./global.css')
  expect(input.sourceGlobs).toContain('../../tools/tailwindcss-test-catalog/compatibility-candidates.txt')
  expect(input.watchFiles).toContain('../../tools/tailwindcss-test-catalog')
  expect(config.watchFolders).toEqual([
    path.resolve(projectRoot, 'existing-source'),
    path.resolve(projectRoot, '../../tools/tailwindcss-test-catalog'),
  ])
})
