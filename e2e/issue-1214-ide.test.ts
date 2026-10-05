import path from 'node:path'
import process from 'node:process'
import { describe, it } from 'vitest'
import { runLayoutIdeProbe } from './issue-1214/ide-runner'

const describeIde = process.env['E2E_IDE'] === '1' ? describe : describe.skip
const artifactRoot = path.resolve(import.meta.dirname, '.artifacts', 'issue-1214-ide')

describeIde('Issue #1214 微信 DevTools 实际尺寸', () => {
  it('工具类与直接最终 rpx 的宽高、padding、负 margin 和 gap 相等', async () => {
    await runLayoutIdeProbe(artifactRoot)
  }, 270_000)
})
