import type { ConsoleMessage, Page, Request } from 'playwright'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

interface EvidenceOptions {
  artifactRoot: string
  caseName: string
  page: Page
  projectRoot: string
  selector?: string
  serverLogs: () => string[]
}

/** 在原有断言执行期间留存页面、请求和服务日志，不将截图存在视为断言通过。 */
export async function withWebHmrEvidence(
  options: EvidenceOptions,
  run: (capture: (stage: string) => Promise<void>) => Promise<void>,
) {
  await fs.mkdir(options.artifactRoot, { recursive: true })
  const directory = await fs.mkdtemp(path.join(options.artifactRoot, `${options.caseName.replace(/[^\w-]/g, '-').slice(0, 80)}-`))
  const { page } = options
  const diagnostics: string[] = []
  const captures: unknown[] = []
  const onConsole = (message: ConsoleMessage) => diagnostics.push(`[console:${message.type()}] ${message.text()}`)
  const onPageError = (error: Error) => diagnostics.push(`[pageerror] ${error.stack ?? error.message}`)
  const onRequestFailed = (request: Request) => diagnostics.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  let status = 'running'
  let failure: string | undefined
  const startedAt = new Date().toISOString()
  const persist = async () => {
    await fs.writeFile(path.join(directory, 'report.json'), `${JSON.stringify({
      caseName: options.caseName,
      projectRoot: options.projectRoot,
      browserVersion: page.context().browser()?.version(),
      startedAt,
      recordedAt: new Date().toISOString(),
      status,
      failure,
      captures,
      diagnostics,
      serverLogs: options.serverLogs(),
    }, null, 2)}\n`)
  }
  const capture = async (stage: string) => {
    const filename = `${captures.length}-${stage.replace(/[^\w-]/g, '-')}.png`
    const screenshot = await page.screenshot({ path: path.join(directory, filename), fullPage: true, timeout: 5000 })
    let targetScreenshot: { filename: string, sha256: string } | undefined
    const target = options.selector ? page.locator(options.selector).first() : undefined
    if (target && await target.isVisible()) {
      // 应用内部滚动容器不受 fullPage 控制，另存断言节点以避免遗漏屏外 HMR 标记。
      const targetFilename = filename.replace(/\.png$/, '-target.png')
      const image = await target.screenshot({ path: path.join(directory, targetFilename), timeout: 5000 })
      targetScreenshot = { filename: targetFilename, sha256: createHash('sha256').update(image).digest('hex') }
    }
    const state = await page.evaluate((selector) => {
      const element = selector ? document.querySelector(selector) : document.body
      if (!element) {
        return { selector, found: false }
      }
      const style = getComputedStyle(element)
      return {
        selector,
        found: true,
        text: element.textContent?.slice(0, 4000),
        className: element.getAttribute('class'),
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderTopColor: style.borderTopColor,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
      }
    }, options.selector)
    captures.push({ stage, at: new Date().toISOString(), url: page.url(), filename, sha256: createHash('sha256').update(screenshot).digest('hex'), targetScreenshot, state })
    await persist()
  }
  try {
    await run(capture)
    await capture('after')
    status = 'assertions-passed'
  }
  catch (error) {
    status = 'failed'
    failure = error instanceof Error ? error.stack ?? error.message : String(error)
    await capture('failure').catch(error => diagnostics.push(`[capture-failure] ${String(error)}`))
    throw error
  }
  finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
    await persist()
  }
}
