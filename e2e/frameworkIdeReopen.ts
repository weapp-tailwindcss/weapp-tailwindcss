import type { CliOptions } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { Launcher } from '../scripts/wechat/automator'
import { ownedWechatEndpoint } from '../scripts/wechat/service'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { awaitWithAbort, withAbortDeadline } from './framework-ide/abort'
import { withCleanup } from './framework-ide/cleanup'
import { getDevToolsRelaunchTimeoutMs, getDevToolsVisibleTimeoutMs, readPageLiveContent } from './frameworkIdeLivePage'

export async function withDevToolsRelaunchTimeout<T>(options: CliOptions, pageUrl: string, task: Promise<T>, signal?: AbortSignal) {
  const timeoutMs = getDevToolsRelaunchTimeoutMs(options)
  return withAbortDeadline(timeoutMs, `DevTools reLaunch timed out after ${timeoutMs}ms: ${pageUrl}`, current => awaitWithAbort(current, () => task), signal)
}

export async function readFreshDevToolsPageContent(
  projectPath: string,
  options: CliOptions,
  pageUrl: string,
  marker: string,
  signal?: AbortSignal,
): Promise<string> {
  const launcher = new Launcher()
  let freshMiniProgram: Awaited<ReturnType<Launcher['connect']>> | undefined
  let content = ''
  await withCleanup(async () => {
    signal?.throwIfAborted()
    // 等待有界连接完成后再响应取消，确保迟到连接也进入 finally；不重新打开外层项目。
    freshMiniProgram = await launcher.connect({
      wsEndpoint: ownedWechatEndpoint(projectPath),
      timeout: getDevToolsRelaunchTimeoutMs(options),
    })
    signal?.throwIfAborted()
    await waitFor(
      async () => {
        try {
          signal?.throwIfAborted()
          const page = await withDevToolsRelaunchTimeout(options, pageUrl, freshMiniProgram!.reLaunch(pageUrl), signal)
          if (!page) {
            return false
          }
          const liveContent = await readPageLiveContent(page, pageUrl, signal)
          if (!liveContent.includes(marker)) {
            return false
          }
          content = liveContent
          return true
        }
        catch (error) {
          signal?.throwIfAborted()
          if (error instanceof AggregateError) {
            throw error
          }
          return false
        }
      },
      {
        timeoutMs: getDevToolsVisibleTimeoutMs(options),
        pollMs: options.pollMs,
        message: `DevTools page did not show HMR marker after reconnecting to project: ${marker} (${pageUrl})`,
        onTick: () => signal?.throwIfAborted(),
        signal,
      },
    )
  }, [{
    // 项目由外层 probe 统一关闭；临时读取只释放自己的连接。
    label: `Failed to disconnect temporary IDE client for ${projectPath}`,
    run: async () => freshMiniProgram?.disconnect(),
  }])
  return content
}
