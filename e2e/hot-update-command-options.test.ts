import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { extendedEnvironment } from '../scripts/demo-e2e-workflow/extended-environment'
import { resolveOptions } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cli'
import { buildWatchHmrArgs, resolveWatchCommandOptions } from './run-hot-update'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function childOptions() {
  const args = buildWatchHmrArgs('weapp-vite-tailwindcss-v4', resolveWatchCommandOptions('report.json'))
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'watch.ts', ...args.slice(args.indexOf('--') + 1)])
  return resolveOptions()
}

it.each(['0', 'false'])('显式关闭跳过构建（%s）时，watch 子入口执行包构建', (value) => {
  vi.stubEnv('E2E_WATCH_SKIP_BUILD', value)
  expect(childOptions().skipBuild).toBe(false)
})

it.each([undefined, '1', 'true'])('普通入口保留已有跳过构建配置（%s）', (value) => {
  vi.stubEnv('E2E_WATCH_SKIP_BUILD', value)
  expect(childOptions().skipBuild).toBe(true)
})

it('扩展工作流覆盖继承的跳过构建配置，并传递到最终 watch 参数', () => {
  const env = extendedEnvironment({ ...process.env, E2E_WATCH_SKIP_BUILD: '1' })
  vi.stubEnv('E2E_WATCH_SKIP_BUILD', env['E2E_WATCH_SKIP_BUILD'])
  vi.stubEnv('E2E_WATCH_MAX_PLUGIN_PROCESS_MS', undefined)
  const options = childOptions()
  expect(options.skipBuild).toBe(false)
  expect(options.caseName).toBe('weapp-vite-tailwindcss-v4')
  expect(options.maxPluginProcessMs).toBe(500)
})
