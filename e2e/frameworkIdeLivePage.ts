import type { CliOptions } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import process from 'node:process'
import { awaitWithAbort, withAbortDeadline } from './framework-ide/abort'

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function getDevToolsReadTimeoutMs() {
  return readNumberEnv(
    'E2E_IDE_DEVTOOLS_READ_TIMEOUT_MS',
    Math.min(readNumberEnv('E2E_AUTOMATOR_TIMEOUT_MS', 20_000), 15_000),
  )
}

export function getDevToolsVisibleTimeoutMs(options: CliOptions) {
  return Math.min(options.timeoutMs, readNumberEnv('E2E_IDE_VISIBLE_TIMEOUT_MS', 30_000))
}

export function getDevToolsBestEffortVisibleTimeoutMs(options: CliOptions) {
  return Math.min(getDevToolsVisibleTimeoutMs(options), readNumberEnv('E2E_IDE_BEST_EFFORT_VISIBLE_TIMEOUT_MS', 3000))
}

export function getDevToolsRelaunchTimeoutMs(options: CliOptions) {
  return Math.min(options.timeoutMs, readNumberEnv('E2E_IDE_RELAUNCH_TIMEOUT_MS', 20_000))
}

function stringifyLiveValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

async function readElementContent(element: any, label: string, signal?: AbortSignal) {
  if (!element) {
    return ''
  }
  const text = await awaitWithAbort(signal, () => element.text()).catch(() => undefined)
  if (text != null && text !== '') {
    return `[${label}:text] ${stringifyLiveValue(text)}`
  }
  const parts: string[] = []
  const reads: Array<[string, () => Promise<unknown>]> = [
    ['class', () => element.attribute('class')],
    ['outerWxml', () => element.outerWxml()],
  ]

  for (const [kind, read] of reads) {
    const value = await awaitWithAbort(signal, read).catch(() => undefined)
    if (value != null && value !== '') {
      parts.push(`[${label}:${kind}] ${stringifyLiveValue(value)}`)
    }
  }
  return parts.join('\n')
}

async function readSelectorContent(page: any, selector: string, limit: number, signal?: AbortSignal) {
  const rawElements = selector === 'page'
    ? [await awaitWithAbort(signal, () => page.$('page')).catch(() => undefined)]
    : await awaitWithAbort(signal, () => page.$$(selector)).catch(() => [])
  const elements = Array.isArray(rawElements) ? rawElements.filter(Boolean) : []
  const parts: string[] = []
  for (const [index, element] of elements.slice(0, limit).entries()) {
    const content = await readElementContent(element, `${selector}:${index}`, signal)
    if (content) {
      parts.push(content)
    }
  }
  return parts.join('\n')
}

export async function readPageLiveContentRaw(page: any, signal?: AbortSignal) {
  const selectorLimit = readNumberEnv('E2E_IDE_LIVE_SELECTOR_LIMIT', 80)
  const selectors = ['view', 'text', 'button']
  const parts: string[] = []

  const pageContent = await readSelectorContent(page, 'page', 1, signal)
  if (pageContent) {
    parts.push(pageContent)
  }

  for (const selector of selectors) {
    const content = await readSelectorContent(page, selector, selectorLimit, signal)
    if (content) {
      parts.push(content)
    }
  }

  const pageData = await awaitWithAbort(signal, () => page.data()).catch(() => undefined)
  signal?.throwIfAborted()
  if (pageData != null) {
    parts.push(`[page:data] ${stringifyLiveValue(pageData)}`)
  }

  if (parts.length === 0) {
    throw new TypeError('Failed to read live page content for IDE hot update')
  }
  return parts.join('\n')
}

export async function readPageLiveContent(page: any, pageUrl: string, signal?: AbortSignal) {
  const timeoutMs = getDevToolsReadTimeoutMs()
  return withAbortDeadline(timeoutMs, `DevTools live page read timed out after ${timeoutMs}ms: ${pageUrl}`, current => readPageLiveContentRaw(page, current), signal)
}

export async function readCurrentPageLiveContent(miniProgram: any, fallbackPage: any, pageUrl: string, signal?: AbortSignal) {
  const page = await awaitWithAbort(signal, () => miniProgram.currentPage({ timeout: getDevToolsReadTimeoutMs() }))
    .catch(() => fallbackPage) ?? fallbackPage
  return {
    content: await readPageLiveContent(page, pageUrl, signal),
    page,
  }
}
