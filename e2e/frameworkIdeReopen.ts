import type { CliOptions } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import process from 'node:process'
import { Launcher } from '../scripts/wechat/automator'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { getDevToolsRelaunchTimeoutMs, getDevToolsVisibleTimeoutMs, readPageLiveContent } from './frameworkIdeLivePage'

export async function withDevToolsRelaunchTimeout<T>(options: CliOptions, pageUrl: string, task: Promise<T>) {
  const timeoutMs = getDevToolsRelaunchTimeoutMs(options)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`DevTools reLaunch timed out after ${timeoutMs}ms: ${pageUrl}`))
        }, timeoutMs)
      }),
    ])
  }
  finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export async function readFreshDevToolsPageContent(
  projectPath: string,
  options: CliOptions,
  pageUrl: string,
  marker: string,
): Promise<string> {
  const launcher = new Launcher()
  const cliPath = process.env['E2E_PREFLIGHT_WECHAT_CLI']
  let freshMiniProgram: Awaited<ReturnType<Launcher['launch']>> | undefined
  let content = ''
  await waitFor(
    async () => {
      try {
        if (!freshMiniProgram) {
          freshMiniProgram = await launcher.launch({
            ...(cliPath ? { cliPath } : {}),
            projectPath,
            timeout: getDevToolsRelaunchTimeoutMs(options),
          })
        }
        const page = await withDevToolsRelaunchTimeout(options, pageUrl, freshMiniProgram.reLaunch(pageUrl))
        if (!page) {
          return false
        }
        const liveContent = await readPageLiveContent(page, pageUrl)
        if (!liveContent.includes(marker)) {
          return false
        }
        content = liveContent
        return true
      }
      catch {
        return false
      }
    },
    {
      timeoutMs: getDevToolsVisibleTimeoutMs(options),
      pollMs: options.pollMs,
      message: `DevTools page did not show HMR marker after reopening project: ${marker} (${pageUrl})`,
    },
  ).finally(() => {
    // 项目由外层 probe 统一关闭；临时读取只释放自己的连接。
    try {
      freshMiniProgram?.disconnect()
    }
    catch {
    }
  })
  return content
}
