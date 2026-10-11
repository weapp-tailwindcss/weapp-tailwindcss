import type { Page } from 'playwright'
import type { WebRuntimeStyleAssertion } from '../cases'
import { pollIntervalMs, serverTimeoutMs, wait } from '../process'

export interface WebPageDiagnostics {
  errors: string[]
  requests: string[]
  warnings: string[]
}

function formatRuntimeStyleAssertions(assertions: WebRuntimeStyleAssertion[]) {
  return assertions.map((assertion) => {
    const scope = assertion.scopeAttribute ? ` scope=${assertion.scopeAttribute}` : ''
    return `${assertion.selector}${scope}: ${Object.keys(assertion.styles).join(', ')}`
  }).join('; ')
}

export function matchRuntimeStyles(actual: Record<string, string | string[]>, assertion: WebRuntimeStyleAssertion) {
  if (assertion.classFromText && (typeof actual.__textContent !== 'string'
    || !actual.__textContent || !Array.isArray(actual.__classList)
    || !actual.__classList.includes(actual.__textContent))) {
    return false
  }
  if (assertion.scopeAttribute) {
    const attributeNames = actual.__attributeNames
    if (!Array.isArray(attributeNames) || !attributeNames.some(name => assertion.scopeAttribute!.test(name))) {
      return false
    }
  }
  for (const [property, expected] of Object.entries(assertion.styles)) {
    const value = actual[property]
    if (typeof expected === 'string') {
      if (value !== expected) {
        return false
      }
    }
    else if (!expected.test(typeof value === 'string' ? value : '')) {
      return false
    }
  }
  return true
}

export async function readRuntimeStyles(page: Page, assertion: WebRuntimeStyleAssertion) {
  try {
    return await page.evaluate(({ selector, properties }) => {
      const element = document.querySelector(selector)
      if (!element) {
        return null
      }
      const computed = getComputedStyle(element)
      return {
        ...Object.fromEntries(properties.map(property => [property, computed[property as keyof CSSStyleDeclaration]?.toString() ?? ''])),
        __attributeNames: element.getAttributeNames(),
        __classList: Array.from(element.classList),
        __textContent: element.textContent?.trim() ?? '',
      }
    }, {
      properties: Object.keys(assertion.styles),
      selector: assertion.selector,
    })
  }
  catch (error) {
    if (error instanceof Error && /Execution context was destroyed|Cannot find context with specified id/.test(error.message)) {
      return null
    }
    throw error
  }
}

async function collectPageSnapshot(page: Page) {
  try {
    return await page.evaluate(() => {
      return {
        body: document.body?.innerHTML.slice(0, 1200) ?? '',
        readyState: document.readyState,
        title: document.title,
        url: location.href,
      }
    })
  }
  catch (error) {
    return {
      body: '',
      readyState: 'unknown',
      title: '',
      url: page.url(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function isShellPage(page: Page) {
  try {
    return await page.evaluate(() => document.body?.innerHTML.includes('<!--app-html-->') ?? false)
  }
  catch {
    return false
  }
}

export async function waitForRuntimeStyles(page: Page, assertions: WebRuntimeStyleAssertion[] | undefined, label: string, logs: string[], diagnostics: WebPageDiagnostics, reloadShell = false) {
  if (!assertions?.length) {
    return
  }

  const startedAt = Date.now()
  let shellReloaded = false
  let latest: Array<{ actual: Record<string, string | string[]> | null, selector: string }> = []
  while (Date.now() - startedAt < serverTimeoutMs) {
    latest = []
    let ok = true
    for (const assertion of assertions) {
      const actual = await readRuntimeStyles(page, assertion)
      latest.push({ actual, selector: assertion.selector })
      if (!actual || !matchRuntimeStyles(actual, assertion)) {
        ok = false
        break
      }
    }
    if (ok) {
      return
    }
    if (reloadShell && !shellReloaded && latest.every(item => item.actual == null) && Date.now() - startedAt > 10_000 && await isShellPage(page)) {
      shellReloaded = true
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
    await wait(pollIntervalMs)
  }

  const snapshot = await collectPageSnapshot(page)
  throw new Error(`等待 Web 运行时样式超时：${label}\nexpected=${formatRuntimeStyleAssertions(assertions)}\nactual=${JSON.stringify(latest)}\npage=${JSON.stringify(snapshot)}\npageRequests=${diagnostics.requests.join('\n')}\npageErrors=${diagnostics.errors.join('\n')}\npageWarnings=${diagnostics.warnings.join('\n')}\n${logs.join('')}`)
}

export async function waitForHmrMarker(page: Page, markerText: string) {
  await page.waitForFunction(text => document.body?.textContent?.includes(text), markerText, {
    timeout: serverTimeoutMs,
  })
}

export async function waitForInitialPageText(page: Page, entries: string[], logs: string[], diagnostics: WebPageDiagnostics) {
  if (entries.length === 0) {
    return
  }
  try {
    await page.waitForFunction((expected) => {
      const text = document.body?.textContent ?? ''
      return expected.every(entry => text.includes(entry))
    }, entries, {
      timeout: serverTimeoutMs,
    })
  }
  catch (error) {
    const bodyText = await page.locator('body').textContent().catch(() => undefined)
    const pageHtml = await page.content().catch(() => undefined)
    throw new Error([
      `等待 Web 初始页面文本超时：${entries.join(', ')}`,
      `body=${JSON.stringify(bodyText)}`,
      `html=${pageHtml ?? ''}`,
      `diagnostics=${JSON.stringify(diagnostics)}`,
      `serverLogs=${logs.join('').slice(-20_000)}`,
    ].join('\n'), { cause: error })
  }
}
