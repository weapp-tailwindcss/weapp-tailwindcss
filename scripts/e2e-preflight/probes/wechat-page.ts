import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { waitForProbe } from './wait'

/** 自动化连接建立不代表页面元数据已就绪；只读等待本轮页面身份。 */
export async function waitForWechatPage(connection: Pick<MiniProgram, 'currentPage'>, runId: string, timeoutMs = 30_000) {
  let page: Awaited<ReturnType<MiniProgram['currentPage']>>
  await waitForProbe(async () => {
    let actual: string | undefined
    try {
      page = await connection.currentPage()
      actual = page ? await (await page.$('#marker'))?.text() : undefined
    }
    catch (error) {
      return { expected: runId, actual: undefined, error: String(error) }
    }
    // 确认串到旧页面时必须立即失败，不能重启或操作它。
    if (actual && actual !== runId) {
      throw new Error(`微信运行页面并非本轮探针：expected=${runId} actual=${actual}`)
    }
    return { expected: runId, actual, error: '' }
  }, value => value.actual === runId, timeoutMs)
  return page!
}
