import { describe, expect, it } from 'vitest'
import { stageCaptureHostContext } from './lynx/capture-host-context'
import { parseNativeRunArgs } from './lynx/native-options'

describe('Android 录制 host 的安全区域门禁', () => {
  const context = { version: 1, runId: 'current-run', bundleSha256: 'actual-bundle' }

  it('真实 capture-only 参数启用安全区域并保留本轮 bundle 身份', () => {
    const options = parseNativeRunArgs(['android', '--capture-only', '--bundle', 'demo.bundle'])
    expect(JSON.parse(JSON.stringify(stageCaptureHostContext(context, options)))).toEqual({ ...context, captureOnly: true })
    expect(context).not.toHaveProperty('captureOnly')
  })

  it('兼容性报告沿用原始 context，不改变历史基线布局', () => {
    expect(stageCaptureHostContext(context, parseNativeRunArgs(['android']))).toBe(context)
  })

  it('iOS 录制不启用 Android host 分支', () => {
    const options = parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'demo.bundle'])
    expect(stageCaptureHostContext(context, options)).toBe(context)
  })
})
