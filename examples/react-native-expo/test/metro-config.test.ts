import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(import.meta.dirname, '..')

it.each([false, true])('Metro 直接消费单入口选项，保留共享监听和显式观察器配置：%s', (enabled) => {
  const input = require('../tailwind-input.cjs')
  const config = { watchFolders: [path.resolve(projectRoot, 'existing-source')] }
  const withWeappTailwindcss = vi.fn((value, options) => ({ value, options }))
  const observed = { ...config, observer: true }
  const withMetroHttpArchive = vi.fn(() => observed)
  const module = { exports: undefined }
  runInNewContext(readFileSync(path.join(projectRoot, 'metro.config.js'), 'utf8'), {
    __dirname: projectRoot,
    module,
    process: { env: {} },
    require: (id: string) => {
      if (id === 'node:path') {
        return path
      }
      if (id === 'node:process') {
        return { env: enabled ? { RN_METRO_HTTP_ARCHIVE: 'explicit-test-config' } : {} }
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
      if (id === '../../e2e/react-native/http-archive.cjs') {
        return { withMetroHttpArchive }
      }
      throw new Error(`Metro 配置读取了未登记依赖：${id}`)
    },
  })
  expect(withWeappTailwindcss).toHaveBeenCalledExactlyOnceWith(enabled ? observed : config, input)
  expect(module.exports).toEqual({ value: enabled ? observed : config, options: input })
  if (enabled) {
    expect(withMetroHttpArchive).toHaveBeenCalledExactlyOnceWith(config)
  }
  else {
    expect(withMetroHttpArchive).not.toHaveBeenCalled()
  }
  expect(input.input).toBe('./global.css')
  expect(input.sourceGlobs).toContain('../../tools/tailwindcss-test-catalog/compatibility-candidates.txt')
  expect(input.watchFiles).toContain('../../tools/tailwindcss-test-catalog')
  expect(config.watchFolders).toEqual([
    path.resolve(projectRoot, 'existing-source'),
    path.resolve(projectRoot, '../../tools/tailwindcss-test-catalog'),
  ])
})
