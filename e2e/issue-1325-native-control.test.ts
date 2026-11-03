import { it } from 'vitest'
import { createIssue1325NativeControlCase } from './hbuilderx-local/issue-1325'
import { hbuilderxAppTimeoutMs } from './hbuilderx-local/process'
import { verifyAppHmrWithHBuilderX } from './hbuilderx-local/runner'

const nativeControl = process.env['E2E_HBUILDERX_LOCAL'] === '1' && process.env['E2E_HBUILDERX_ISSUE1325_CONTROL'] === '1' ? it : it.skip

nativeControl('Issue 1325 无插件 Vapor 原生更新对照', async () => {
  await verifyAppHmrWithHBuilderX(createIssue1325NativeControlCase())
}, hbuilderxAppTimeoutMs * 2 + 30_000)
