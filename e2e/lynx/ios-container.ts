import assert from 'node:assert/strict'
import path from 'node:path'
import { command } from './native-command'

export async function resolveIosAppContainer(deviceId: string, applicationId: string, cwd: string, recordTimeout: (error: unknown) => Promise<void>) {
  const query = async () => {
    const container = (await command('xcrun', ['simctl', 'get_app_container', deviceId, applicationId, 'data'], cwd, 30_000)).trim()
    assert.ok(path.isAbsolute(container) && !/[\r\n]/.test(container), 'simctl 未返回有效的应用容器路径')
    return container
  }
  try {
    return await query()
  }
  catch (firstError) {
    if (!firstError || typeof firstError !== 'object' || !('timedOut' in firstError) || firstError.timedOut !== true) {
      throw firstError
    }
    // 只恢复安装后的只读查询；不重跑构建、安装、启动或样式断言。
    try {
      await recordTimeout(firstError)
      await command('xcrun', ['simctl', 'bootstatus', deviceId, '-b'], cwd, 120_000)
      return await query()
    }
    catch (lastError) {
      const detail = (error: unknown) => error instanceof Error ? error.stack : String(error)
      throw new AggregateError([firstError, lastError], `iOS 应用容器查询恢复失败\n${detail(firstError)}\n${detail(lastError)}`)
    }
  }
}
