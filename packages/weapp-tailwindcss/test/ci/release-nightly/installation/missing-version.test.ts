import { expect, it } from 'vitest'
import { missingBatchVersion } from '../../../../../../scripts/release-nightly/installation/missing-version.mjs'
import { failure, missing, target, version } from './fixture'

const expected = new Set([target, `weapp-tailwindcss@${version}`])

it.each([target, `alias@npm:${target}`, `@scope/alias@npm:${target}`])('只接受已确认批次的精确解析目标 %s', (reference) => {
  expect(missingBatchVersion(failure({ level: 'debug', message: 'resolving' }, missing(reference)), expected)).toBe(true)
})

it('接受 pnpm 的结构化嵌套错误与可验证的传递依赖上下文', () => {
  const context = `\nThis error happened while installing the dependencies of weapp-tailwindcss@${version}`
  const record = missing(target, { pkgsStack: [{ name: 'weapp-tailwindcss', version }] })
  record.message += `\n\nFailed to resolve ${target}${context}`
  expect(missingBatchVersion(failure(record), expected)).toBe(true)
  expect(missingBatchVersion(failure({ level: 'error', err: record }), expected)).toBe(true)
})

it.each([
  '@weapp-tailwindcss/native-linux-x64-gnu@snapshot-nightly',
  '@weapp-tailwindcss/native-linux-x64-gnu@latest',
  '@weapp-tailwindcss/native-linux-x64-gnu@1.0.0',
  `another-package@${version}`,
  `@weapp-tailwindcss/native-linux-x64-gnu@^${version}`,
])('拒绝批次外版本、标签与范围 %s', (reference) => {
  expect(missingBatchVersion(failure(missing(reference)), expected)).toBe(false)
})

it.each([
  missing(target, { code: 'ERR_PNPM_FETCH_401' }),
  missing(target, { code: 'ERR_PNPM_TARBALL_INTEGRITY' }),
  missing(target, { code: 'ECONNRESET' }),
  missing(target, { cause: {} }),
  missing(target, { err: 'text' }),
  missing(target, { err: { code: 'ERR_PNPM_FETCH_403' } }),
  missing(target, { err: { message: 'conflicting identity' } }),
  missing(target, { err: { cause: {} } }),
  missing(target, { pkgsStack: [], err: { pkgsStack: [{ name: 'other', version }] } }),
  missing(target, { message: missing().message.replace('registry.npmjs.org', 'registry.example.test') }),
  missing(target, { message: `${missing().message}\nThis error happened while installing the dependencies of wrong@1.0.0`, pkgsStack: [{ name: 'weapp-tailwindcss', version }] }),
])('未知、认证、完整性或相互冲突的错误立即失败 %#', (record) => {
  expect(missingBatchVersion(failure(record), expected)).toBe(false)
})

it('混合错误、非 JSON 和没有缺版本的输出不能重试', () => {
  expect(missingBatchVersion(failure(missing(), { level: 'error', code: 'ERR_PNPM_FETCH_500' }), expected)).toBe(false)
  expect(missingBatchVersion({ ...failure(missing()), stderr: 'network failed' }, expected)).toBe(false)
  expect(missingBatchVersion(failure([], null, 'text'), expected)).toBe(false)
  expect(missingBatchVersion(failure({ level: 'info', message: missing().message }), expected)).toBe(false)
})

it.each([
  { exitCode: null },
  { exitCode: 0 },
  { timedOut: true },
  { signal: 'SIGTERM' },
  { isCanceled: true },
  { isTerminated: true },
  { isMaxBuffer: true },
  { isForcefullyTerminated: true },
  { cause: new Error('spawn failed') },
  { code: 'EPIPE' },
  { failed: false },
])('超时、终止和进程异常立即失败 %#', (state) => {
  expect(missingBatchVersion({ ...failure(missing()), ...state }, expected)).toBe(false)
})
