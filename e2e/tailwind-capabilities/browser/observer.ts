import type { ConsoleMessage, Page, Request, Response } from 'playwright'

export interface BrowserErrorEvidence {
  event: 'console-error' | 'page-error' | 'http-error' | 'request-failed'
  at: string
  stage: string
  message: string
  url?: string
  status?: number
  resourceType?: string
  lineNumber?: number
  columnNumber?: number
}

/** 错误保留请求身份及所在阶段；只移除本观察器注册的监听，不过滤资源错误。 */
export function observeBrowserErrors(page: Page, stage: () => string, errors: string[]) {
  const records: BrowserErrorEvidence[] = []
  const record = (value: Omit<BrowserErrorEvidence, 'at' | 'stage'>) => {
    const entry = { ...value, at: new Date().toISOString(), stage: stage() }
    records.push(entry)
    errors.push(JSON.stringify(entry))
  }
  const consoleError = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      record({ event: 'console-error', message: message.text(), ...message.location() })
    }
  }
  const pageError = (error: Error) => record({ event: 'page-error', message: error.stack ?? error.message })
  const requestFailed = (request: Request) => record({ event: 'request-failed', message: request.failure()?.errorText ?? '请求失败但缺少浏览器错误详情', url: request.url(), resourceType: request.resourceType() })
  const responseError = (response: Response) => {
    if (response.status() >= 400) {
      record({ event: 'http-error', message: response.statusText(), url: response.url(), status: response.status(), resourceType: response.request().resourceType() })
    }
  }
  page.on('console', consoleError)
  page.on('pageerror', pageError)
  page.on('requestfailed', requestFailed)
  page.on('response', responseError)
  return {
    records,
    dispose() {
      page.off('console', consoleError)
      page.off('pageerror', pageError)
      page.off('requestfailed', requestFailed)
      page.off('response', responseError)
    },
  }
}
