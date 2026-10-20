import { setImmediate } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { evaluateCommonJs, packageSource } from './taro-package.fixture.mjs'

function runner(platform, build) {
  return evaluateCommonJs(packageSource('vite-runner', `dist/index.${platform}.js`), (id) => {
    if (id === '@tarojs/shared') {
      return { isString: value => typeof value === 'string', isFunction: value => typeof value === 'function' }
    }
    if (id === 'vite') {
      return { build }
    }
    if (id === './utils') {
      return { getMode: () => 'production' }
    }
    if (id.startsWith('./utils/compiler/')) {
      return {
        TaroCompilerContext: class {
          constructor(_root, taroConfig) {
            this.taroConfig = taroConfig
          }
        },
      }
    }
    if (id === './utils/component') {
      return { componentConfig: {} }
    }
    if ([`./${platform}`, '@vitejs/plugin-legacy'].includes(id)) {
      return () => ({})
    }
    throw new Error(`未登记依赖：${id}`)
  }).default
}

it.each(['h5', 'mini', 'harmony'])('%s 必须等待异步平台注册完成再 build', async (platform) => {
  const build = vi.fn()
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const run = runner(platform, build)('fixture', {
    async modifyViteConfig(config) {
      await pending
      config.plugins.push({ name: 'registered-after-await' })
    },
  })
  await setImmediate()
  const startedEarly = build.mock.calls.length
  release()
  await run
  expect(startedEarly).toBe(0)
  expect(build.mock.calls[0][0].plugins.at(-1).name).toBe('registered-after-await')
})

it.each(['h5', 'mini', 'harmony'])('%s 的异步注册拒绝不能继续 build', async (platform) => {
  const build = vi.fn()
  const error = new Error('平台注册拒绝')
  let reject
  const pending = new Promise((_resolve, rejectPromise) => {
    reject = rejectPromise
  })
  // 立即观察拒绝，避免旧 runner 的漏 await 令测试自身出现未处理拒绝。
  pending.catch(() => {})
  const run = runner(platform, build)('fixture', { modifyViteConfig: () => pending })
  const result = run.then(() => undefined, value => value)
  reject(error)
  expect(await result).toBe(error)
  expect(build).not.toHaveBeenCalled()
})
