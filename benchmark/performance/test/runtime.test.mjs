import { describe, expect, it } from 'vitest'
import { createRuntimeBenchmarkSubject, makeRuntimeCase } from '../src/runtime.mjs'

describe.each(['cn', 'merge'])('%s 基准语义', (kind) => {
  it('新建实例实际消解冲突并保留 rpx 长度和颜色', () => {
    const subject = createRuntimeBenchmarkSubject(kind)
    const output = subject('p-2 p-4 text-red-500 text-[12rpx]')
    expect(output).not.toContain('p-2')
    expect(output).toContain('p-4')
    expect(output).toContain('text-red-500')
    expect(output).toContain('12rpx')
  })

  it.each(['cold', 'cache-hit', 'cache-miss', 'hot-churn'])('%s 输出稳定且包含真实冲突处理', async (mode) => {
    const run = await makeRuntimeCase(kind, 300, mode).create()
    const first = run()
    expect(first).not.toContain('p-2')
    expect(run()).toBe(first)
  })

  it('自定义映射用实际 runtime options 执行', async () => {
    const run = await makeRuntimeCase(kind, 100, 'custom-map').create()
    expect(run().split(' ')[0]).toBe('@')
  })
})
