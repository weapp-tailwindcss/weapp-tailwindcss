import { expect, it } from 'vitest'
import { hasInitialCompileEvidence } from './dev-startup/readiness'

const name = 'weapp-vite-tailwindcss-v4'

it.each([
  ['Tailwind CSS 初始化完成', 0, 9_000],
  ['分包 built in 2s.', 1, 2_000],
  ['小程序初次构建完成，耗时：15000ms', 1, 15_000],
  ['开发服务已就绪：\n小程序初次构建完成', 1, 15_000],
])('weapp-vite 的中间日志不能提前结束启动验收：%s', (logs, compiledAt, elapsed) => {
  expect(hasInitialCompileEvidence(name, logs, compiledAt, elapsed)).toBe(false)
})

it('weapp-vite 必须在初次构建之后完成监听服务初始化', () => {
  expect(hasInitialCompileEvidence(name, '小程序初次构建完成\n\u001B[32m开发服务已就绪：\u001B[0m', 1, 15_000)).toBe(true)
})

it('保留其他框架的编译成功和包装器初始化边界', () => {
  expect(hasInitialCompileEvidence('taro-vite', 'built in 2s.', 1, 2_000)).toBe(true)
  expect(hasInitialCompileEvidence('wrapper', 'Weapp-tailwindcss', 0, 8_000)).toBe(true)
  expect(hasInitialCompileEvidence('wrapper', 'Weapp-tailwindcss', 0, 7_999)).toBe(false)
  expect(hasInitialCompileEvidence('wrapper', '', 0, 9_000)).toBe(false)
})
