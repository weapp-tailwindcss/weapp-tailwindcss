import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type { Browser, Page } from 'playwright'
import type { WebViteHmrCase } from './web-vite-demo-hmr-cases'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import process from 'node:process'
import path from 'pathe'
import { chromium } from 'playwright'
import { afterEach, describe, it } from 'vitest'
import { writeFilePreserveEol } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { resolveChromeExecutable } from './hbuilderx-local/process'
import { withWebHmrEvidence } from './web-hmr/evidence'
import { webViteHmrCases } from './web-vite-demo-hmr-cases'

interface ViteHmrUpdate {
  acceptedPath?: string
  path?: string
  type?: string
}

interface ViteHmrMessage {
  type?: string
  updates?: ViteHmrUpdate[]
}

interface TailwindClassFlowMutation {
  addedSource: string
  modifiedSource: string
  removedClassSource: string
  selector: string
}

interface SourceMutation {
  previous: string
  next: string
}

const repoRoot = path.resolve(__dirname, '..')
const localUrlRE = /Local:\s*(https?:\/\/\S+)/i
const reloadMarker = 'web-vite-hmr-marker'
const serverTimeoutMs = Number(process.env['E2E_WEB_VITE_HMR_TIMEOUT_MS'] ?? 120_000)
const hmrLatencyLimitMs = Number(process.env['E2E_WEB_VITE_HMR_LATENCY_LIMIT_MS'] ?? 10_000)
const pollIntervalMs = 100
const iconifyClassTokens = [
  'i-[mdi--github-circle]',
  'i-[mdi--star]',
  'i-[svg-spinners--180-ring-with-bg]',
] as const
const iconifyCssSelectors = [
  '.i-\\[mdi--github-circle\\]',
  '.i-\\[mdi--star\\]',
  '.i-\\[svg-spinners--180-ring-with-bg\\]',
] as const
const iconifyBeforeContentClass = 'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！\']'
const iconifyAfterContentClass = 'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！\']'

let devProcess: ChildProcess | undefined
let browser: Browser | undefined
let restoreSource: (() => Promise<void>) | undefined

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stringifyError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function findFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法解析可用端口')))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

function killProcessTree(child: ChildProcess) {
  const pid = child.pid
  if (!pid || child.exitCode != null) {
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  }
  catch {
    child.kill('SIGTERM')
  }
}

function collectProcessOutput(child: ChildProcess) {
  const logs: string[] = []
  const collect = (chunk: Buffer | string) => {
    logs.push(chunk.toString())
    if (logs.length > 120) {
      logs.splice(0, logs.length - 120)
    }
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  return logs
}

function runPredev(projectRoot: string) {
  const result = spawnSync('pnpm', ['run', 'predev'], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_OPTIONS: process.env['NODE_OPTIONS'] ?? '--max-old-space-size=8192',
    },
  })

  if (result.status !== 0) {
    throw new Error(`Web Vite demo predev 失败，exit=${result.status}\n${result.stdout.toString()}${result.stderr.toString()}`)
  }
}

function createDevServer(item: WebViteHmrCase, projectRoot: string, port: number) {
  runPredev(projectRoot)
  const args = item.devCommand.map(arg => arg === '{port}' ? String(port) : arg)
  const child = spawn('pnpm', args, {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BROWSER: 'none',
      NODE_ENV: 'development',
      NODE_OPTIONS: process.env['NODE_OPTIONS'] ?? '--max-old-space-size=8192',
    },
  })
  devProcess = child
  return child
}

function resolveBaseUrls(logs: string[], fallbackUrl: string) {
  const urls = new Set([fallbackUrl])
  for (const chunk of logs) {
    for (const line of chunk.split(/\r?\n/)) {
      const matched = line.match(localUrlRE)?.[1]
      if (matched) {
        urls.add(matched)
      }
    }
  }
  return Array.from(urls)
}

async function waitForReadyUrl(item: WebViteHmrCase, child: ChildProcess, logs: string[], fallbackUrl: string) {
  let lastError: unknown
  const startedAt = Date.now()

  while (Date.now() - startedAt < serverTimeoutMs) {
    if (child.exitCode != null) {
      throw new Error(`dev server 提前退出，exit=${child.exitCode}\n${logs.join('')}`)
    }
    for (const baseUrl of resolveBaseUrls(logs, fallbackUrl)) {
      try {
        const response = await fetch(baseUrl)
        if (response.ok && (!item.readyLog || item.readyLog.test(logs.join('')))) {
          return baseUrl
        }
        lastError = new Error(`${baseUrl} -> HTTP ${response.status} ${response.statusText}`)
      }
      catch (error) {
        lastError = error
      }
    }
    await wait(pollIntervalMs)
  }

  throw new Error(`等待 Web Vite dev server 超时：${lastError instanceof Error ? lastError.message : String(lastError)}\n${logs.join('')}`)
}

type SourceMutationKind = 'all' | 'class' | 'title'

async function mutateSource(item: WebViteHmrCase, sourceFile: string, kind: SourceMutationKind = 'all') {
  const current = await fs.readFile(sourceFile, 'utf8')
  let next = current
  if (kind === 'all' || kind === 'class') {
    next = next.replace(item.classFrom, item.classTo)
  }
  if ((kind === 'all' || kind === 'title') && item.titleFrom && item.titleTo) {
    next = next.replace(item.titleFrom, item.titleTo)
  }
  if (next === current) {
    throw new Error(`${item.name} Web HMR 源码替换没有产生变化`)
  }
  await writeFilePreserveEol(sourceFile, next, current)
  return {
    previous: current,
    next,
  } satisfies SourceMutation
}

function createIconifyProbeSource(source: string, item: WebViteHmrCase) {
  const marker = `web-iconify-hmr-${item.markerAttr}`
  const classLiteral = [...iconifyClassTokens, iconifyBeforeContentClass].join(' ')
  const sourceProbe = item.sourceFile.endsWith('.tsx')
    ? `\n// ${marker} ${classLiteral}\n`
    : `\n<!-- ${marker} ${classLiteral} -->\n`
  return `${source}${sourceProbe}`
}

function isTransientPageEvaluationError(error: unknown) {
  return error instanceof Error
    && /Execution context was destroyed|Cannot find context with specified id|Target page, context or browser has been closed/.test(error.message)
}

async function collectPageCss(page: Page) {
  try {
    return await page.evaluate(async () => {
      const texts: string[] = []
      for (const style of Array.from(document.querySelectorAll('style'))) {
        texts.push(style.textContent ?? '')
      }
      for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]'))) {
        try {
          texts.push(await fetch(link.href).then(response => response.text()))
        }
        catch {}
      }
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          texts.push(Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'))
        }
        catch {}
      }
      return texts.join('\n')
    })
  }
  catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return ''
    }
    throw error
  }
}

async function waitForIconifyCss(page: Page, item: WebViteHmrCase, contentClass: string) {
  let lastCssSample = ''
  const startedAt = Date.now()
  while (Date.now() - startedAt < serverTimeoutMs) {
    const css = await collectPageCss(page)
    lastCssSample = css.slice(-2_000)
    const hasIcons = iconifyCssSelectors.every(selector => css.includes(selector))
    const hasContent = css.includes(contentClass.replace(/[[\]]/g, '\\$&'))
      || css.includes('before\\:content')
      || css.includes('before\\3A content')
    if (hasIcons && hasContent) {
      return
    }
    await wait(pollIntervalMs)
  }
  throw new Error(`${item.name} Web Iconify HMR CSS 未更新或图标丢失：${lastCssSample}`)
}

async function runWebIconifyHmr(page: Page, item: WebViteHmrCase, sourceFile: string, original: string) {
  const sourceWithProbe = createIconifyProbeSource(original, item)
  if (!sourceWithProbe.includes(iconifyBeforeContentClass)) {
    throw new Error(`${item.name} Web Iconify HMR probe 缺少 before content class`)
  }
  const sourceWithUpdatedContent = sourceWithProbe.replace(iconifyBeforeContentClass, iconifyAfterContentClass)
  await writeFilePreserveEol(sourceFile, sourceWithProbe, original)
  await waitForIconifyCss(page, item, iconifyBeforeContentClass)
  await writeFilePreserveEol(sourceFile, sourceWithUpdatedContent, original)
  await waitForIconifyCss(page, item, iconifyAfterContentClass)
}

function createTailwindClassFlowMutation(item: WebViteHmrCase, original: string): TailwindClassFlowMutation {
  const isReact = item.sourceFile.endsWith('.tsx')
  const replacements: Array<{ from: string, to: string, removedTo: string, selector: string }> = isReact
    ? [
        {
          from: `className="box-border theme-mode-demo mt-4 rounded leading-[24px] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          to: `className="box-border theme-mode-demo mt-4 rounded leading-[24px] border border-[#00ff00] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          removedTo: `data-web-vite-hmr-flow="removed" className="box-border theme-mode-demo mt-4 rounded leading-[24px] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          selector: '.theme-mode-demo',
        },
      ]
    : [
        {
          from: `class="box-border theme-mode-demo mt-4 rounded leading-[24px] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          to: `class="box-border theme-mode-demo mt-4 rounded leading-[24px] border border-[#00ff00] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          removedTo: `data-web-vite-hmr-flow="removed" class="box-border theme-mode-demo mt-4 rounded leading-[24px] bg-white px-4 py-3 text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#18181b] dark:text-[#fafafa]"`,
          selector: '.theme-mode-demo',
        },
        {
          from: `class="theme-mode-demo mt-4 block bg-white text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#09090b] dark:text-[#fafafa]"`,
          to: `class="theme-mode-demo mt-4 block border border-[#00ff00] bg-white text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#09090b] dark:text-[#fafafa]"`,
          removedTo: `data-web-vite-hmr-flow="removed" class="theme-mode-demo mt-4 block bg-white text-[#0f172b] system-dark:bg-[#0f172b] system-dark:text-[#f1f5f9] dark:bg-[#09090b] dark:text-[#fafafa]"`,
          selector: '.theme-mode-demo',
        },
        {
          from: `class="min-h-screen bg-white p-6 text-[#111827]"`,
          to: `class="min-h-screen border border-[#00ff00] bg-white p-6 text-[#111827]"`,
          removedTo: `data-web-vite-hmr-flow="removed" class="min-h-screen bg-white p-6 text-[#111827]"`,
          selector: 'main',
        },
      ]

  const replacement = replacements.find(({ from }) => original.includes(from))
  if (!replacement) {
    throw new Error(`${item.name} Web HMR 未找到 Tailwind class flow 插入点`)
  }

  const addedSource = original.replace(replacement.from, replacement.to)
  const modifiedSource = addedSource.replace('border-[#00ff00]', 'border-[#ff00aa]')
  const removedClassSource = original.replace(replacement.from, replacement.removedTo)
  return {
    addedSource,
    modifiedSource,
    removedClassSource,
    selector: replacement.selector,
  }
}

async function waitForInitialRender(page: Page, item: WebViteHmrCase, baseUrl: string) {
  let lastError = ''
  const startedAt = Date.now()
  const targetSelector = item.targetSelector ?? 'h1'
  const expectedText = item.titleFrom

  while (Date.now() - startedAt < serverTimeoutMs) {
    try {
      const title = await page.locator(targetSelector).textContent({ timeout: 2_000 })
      if (!expectedText || title?.includes(expectedText)) {
        return
      }
      lastError = `${targetSelector}=${title}`
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(serverTimeoutMs, 60_000),
    }).catch((error) => {
      lastError = error instanceof Error ? error.message : String(error)
    })
    await wait(pollIntervalMs)
  }

  const body = await page.locator('body').textContent().catch(error => String(error))
  throw new Error(`${item.name} Web HMR 初始页面未渲染：${lastError}\nbody=${body}`)
}

async function waitForDomHmr(page: Page, item: WebViteHmrCase, messages?: ViteHmrMessage[], fromIndex = 0) {
  let lastError = ''
  let reloadAttempted = false
  const startedAt = Date.now()
  const targetSelector = item.targetSelector ?? 'h1'

  while (Date.now() - startedAt < serverTimeoutMs) {
    try {
      const actual = await page.locator(targetSelector).evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
          color: style.color.replace(/\s+/g, ' '),
          text: element.textContent?.trim() ?? '',
          marker: element.getAttribute('data-web-vite-hmr'),
        }
      })
      const property = item.styleProperty ?? 'color'
      const expectedStyleValue = item.expectedStyleValue ?? 'rgb(255, 0, 0)'
      const styleMatched = item.styleRequired === false || actual[property] === expectedStyleValue
      const textMatched = !item.titleTo || actual.text.includes(item.titleTo)
      if (textMatched && styleMatched) {
        return
      }
      lastError = JSON.stringify(actual)
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (item.reloadAllowed && !reloadAttempted && Date.now() - startedAt >= 1_000) {
      reloadAttempted = true
      await page.reload({
        waitUntil: 'domcontentloaded',
        timeout: Math.min(serverTimeoutMs, 60_000),
      }).catch((error) => {
        lastError = error instanceof Error ? error.message : String(error)
      })
    }
    await wait(pollIntervalMs)
  }

  const body = await page.locator('body').textContent().catch(error => String(error))
  const hmr = messages ? `\nhmr=${JSON.stringify(messages.slice(fromIndex))}` : ''
  throw new Error(`${item.name} Web HMR DOM 未更新：${lastError}\nbody=${body}${hmr}`)
}

async function waitForTitleHmr(page: Page, item: WebViteHmrCase, options: {
  timeoutMs?: number
  messages?: ViteHmrMessage[]
  fromIndex?: number
} = {}) {
  if (!item.titleTo) {
    return
  }
  let lastError = ''
  const startedAt = Date.now()
  const targetSelector = item.targetSelector ?? 'h1'
  const timeoutMs = options.timeoutMs ?? serverTimeoutMs

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const actual = await page.locator(targetSelector).textContent({ timeout: 2_000 })
      if (actual?.includes(item.titleTo)) {
        return
      }
      lastError = `${targetSelector}=${actual}`
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await wait(pollIntervalMs)
  }

  const body = await page.locator('body').textContent().catch(error => String(error))
  const hmr = options.messages ? `\nhmr=${JSON.stringify(options.messages.slice(options.fromIndex ?? 0))}` : ''
  throw new Error(`${item.name} Web HMR 文本未更新：${lastError}\nbody=${body}${hmr}`)
}

async function waitForTitleHmrAfterMutation(page: Page, item: WebViteHmrCase, sourceFile: string, mutation: SourceMutation, messages: ViteHmrMessage[], fromIndex: number) {
  if (!item.titleHmrRetry) {
    await waitForTitleHmr(page, item, { messages, fromIndex })
    return
  }

  const startedAt = Date.now()
  const firstAttemptMs = Math.min(30_000, Math.max(5_000, Math.floor(serverTimeoutMs / 4)))
  let firstError: unknown
  try {
    await waitForTitleHmr(page, item, {
      timeoutMs: firstAttemptMs,
      messages,
      fromIndex,
    })
    return
  }
  catch (error) {
    firstError = error
  }

  await writeFilePreserveEol(sourceFile, mutation.previous, mutation.previous)
  await wait(500)
  await writeFilePreserveEol(sourceFile, mutation.next, mutation.previous)

  const elapsedMs = Date.now() - startedAt
  try {
    await waitForTitleHmr(page, item, {
      timeoutMs: Math.max(firstAttemptMs, serverTimeoutMs - elapsedMs),
      messages,
      fromIndex,
    })
  }
  catch (error) {
    throw new Error(`${item.name} Web HMR 文本重试后仍未更新：first=${stringifyError(firstError)}\nsecond=${stringifyError(error)}`)
  }
}

async function waitForClassHmr(page: Page, item: WebViteHmrCase, messages?: ViteHmrMessage[], fromIndex = 0) {
  let lastError = ''
  const startedAt = Date.now()
  const targetSelector = item.targetSelector ?? 'h1'

  while (Date.now() - startedAt < serverTimeoutMs) {
    try {
      const actual = await page.locator(targetSelector).evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
          color: style.color.replace(/\s+/g, ' '),
          marker: element.getAttribute('data-web-vite-hmr'),
        }
      })
      const property = item.styleProperty ?? 'color'
      const expectedStyleValue = item.expectedStyleValue ?? 'rgb(255, 0, 0)'
      const styleMatched = item.styleRequired === false || actual[property] === expectedStyleValue
      if (actual.marker === item.markerAttr && styleMatched) {
        return
      }
      lastError = JSON.stringify(actual)
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await wait(pollIntervalMs)
  }

  const body = await page.locator('body').textContent().catch(error => String(error))
  const hmr = messages ? `\nhmr=${JSON.stringify(messages.slice(fromIndex))}` : ''
  throw new Error(`${item.name} Web HMR class 未更新：${lastError}\nbody=${body}${hmr}`)
}

async function waitForFlowElementStyle(page: Page, item: WebViteHmrCase, selector: string, expected: {
  backgroundColor?: string
  borderTopColor?: string
  borderTopWidth?: string
  color?: string
  paddingLeft?: string
  text?: string
  className?: string
}) {
  let lastError = ''
  const startedAt = Date.now()

  while (Date.now() - startedAt < serverTimeoutMs) {
    try {
      const actual = await page.locator(selector).evaluate((element) => {
        const style = window.getComputedStyle(element)
        return {
          backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
          borderTopColor: style.borderTopColor.replace(/\s+/g, ' '),
          borderTopWidth: style.borderTopWidth,
          color: style.color.replace(/\s+/g, ' '),
          paddingLeft: style.paddingLeft,
          text: element.textContent?.trim() ?? '',
          className: element.getAttribute('class') ?? '',
        }
      })
      const matched = (expected.backgroundColor === undefined || actual.backgroundColor === expected.backgroundColor)
        && (expected.borderTopColor === undefined || actual.borderTopColor === expected.borderTopColor)
        && (expected.borderTopWidth === undefined || actual.borderTopWidth === expected.borderTopWidth)
        && (expected.color === undefined || actual.color === expected.color)
        && (expected.paddingLeft === undefined || actual.paddingLeft === expected.paddingLeft)
        && (expected.text === undefined || actual.text === expected.text)
        && (expected.className === undefined || actual.className === expected.className)
      if (matched) {
        return
      }
      lastError = JSON.stringify(actual)
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await wait(pollIntervalMs)
  }

  const body = await page.locator('body').textContent().catch(error => String(error))
  throw new Error(`${item.name} Web HMR Tailwind class flow 样式未更新：${lastError}\nbody=${body}`)
}

async function measureHmrLatency(name: string, task: () => Promise<void>) {
  const startedAt = performance.now()
  await task()
  const durationMs = Math.round(performance.now() - startedAt)
  process.stdout.write(`[web-vite-hmr] ${name} ${durationMs}ms\n`)
  if (durationMs > hmrLatencyLimitMs) {
    throw new Error(`${name} HMR 耗时 ${durationMs}ms，超过 ${hmrLatencyLimitMs}ms 上限`)
  }
}

function collectViteHmrMessages(page: Page) {
  const messages: ViteHmrMessage[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => {
      const payload = event.payload.toString()
      if (!payload.startsWith('{')) {
        return
      }
      try {
        messages.push(JSON.parse(payload) as ViteHmrMessage)
      }
      catch {}
    })
  })
  return messages
}

function expectViteSourceHmrUpdate(item: WebViteHmrCase, messages: ViteHmrMessage[], fromIndex = 0) {
  if (item.sourceUpdateRequired === false) {
    return
  }
  if (!item.expectedViteHmrPath && !item.expectedViteHmrPathIncludes) {
    return
  }
  const updates = messages.slice(fromIndex)
    .filter(message => message.type === 'update')
    .flatMap(message => message.updates ?? [])
  const sourceUpdates = updates.filter((update) => {
    return update.type === 'js-update'
      && (
        update.path === item.expectedViteHmrPath
        || update.acceptedPath === item.expectedViteHmrPath
        || (
          item.expectedViteHmrPathIncludes !== undefined
          && (
            update.path?.includes(item.expectedViteHmrPathIncludes) === true
            || update.acceptedPath?.includes(item.expectedViteHmrPathIncludes) === true
          )
        )
      )
  })
  if (sourceUpdates.length > 0) {
    return
  }
  throw new Error(`${item.name} Web HMR 未收到源文件 js-update：${JSON.stringify(updates)}`)
}

function expectNoViteFullReload(item: WebViteHmrCase, messages: ViteHmrMessage[], fromIndex = 0) {
  const fullReloads = messages.slice(fromIndex)
    .filter(message => message.type === 'full-reload')
  if (fullReloads.length === 0) {
    return
  }
  throw new Error(`${item.name} Web HMR 触发了 full-reload：${JSON.stringify(fullReloads)}`)
}

async function markPageSession(page: Page) {
  await page.evaluate((marker) => {
    Reflect.set(window, '__WEB_VITE_HMR_RELOAD_MARKER__', marker)
  }, reloadMarker)
}

async function expectPageSessionPreserved(page: Page, item: WebViteHmrCase) {
  if (item.reloadAllowed) {
    return
  }
  const actual = await page.evaluate(() => Reflect.get(window, '__WEB_VITE_HMR_RELOAD_MARKER__'))
  if (actual === reloadMarker) {
    return
  }
  throw new Error(`${item.name} Web HMR 页面发生了刷新`)
}

async function cleanupWithTimeout(name: string, task: () => Promise<void> | void, timeoutMs = 5_000) {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      Promise.resolve().then(task),
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${name} cleanup timed out after ${timeoutMs}ms`))
        }, timeoutMs)
        timeout.unref?.()
      }),
    ])
  }
  finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function cleanupBestEffort(name: string, task: () => Promise<void> | void, timeoutMs = 5_000) {
  await cleanupWithTimeout(name, task, timeoutMs).catch(() => undefined)
}

describe('demo/web source HMR', () => {
  afterEach(async () => {
    if (restoreSource) {
      await cleanupWithTimeout('restore source', restoreSource)
      restoreSource = undefined
    }
    if (devProcess) {
      killProcessTree(devProcess)
      devProcess = undefined
    }
    if (browser) {
      await cleanupBestEffort('close browser', () => browser?.close())
      browser = undefined
    }
  }, 30_000)

  it.each(webViteHmrCases)('updates title and arbitrary text color for $name', async (item) => {
    const projectRoot = path.resolve(repoRoot, item.projectDir)
    const sourceFile = path.resolve(projectRoot, item.sourceFile)
    const port = await findFreePort()
    const child = createDevServer(item, projectRoot, port)
    const logs = collectProcessOutput(child)
    const baseUrl = await waitForReadyUrl(item, child, logs, `http://127.0.0.1:${port}/`)

    browser = await chromium.launch({
      executablePath: await resolveChromeExecutable(),
      headless: true,
    })
    const page = await browser.newPage()
    await withWebHmrEvidence({
      artifactRoot: path.resolve(repoRoot, 'e2e/.artifacts/web-vite-hmr'),
      caseName: `${item.name}-title-color`,
      page,
      projectRoot,
      selector: item.targetSelector ?? 'h1',
      serverLogs: () => logs,
    }, async (capture) => {
      const hmrMessages = collectViteHmrMessages(page)
      const original = await fs.readFile(sourceFile, 'utf8')
      restoreSource = async () => {
        await writeFilePreserveEol(sourceFile, original, original)
      }
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(serverTimeoutMs, 60_000),
      })
      await waitForInitialRender(page, item, baseUrl)
      await capture('before')
      await markPageSession(page)
      if (item.matrixCoverage !== false) {
        await runWebIconifyHmr(page, item, sourceFile, original)
        await expectPageSessionPreserved(page, item)
      }

      if (item.expectedViteHmrPath || item.expectedViteHmrPathIncludes) {
        const titleMessageStart = hmrMessages.length
        if (item.titleFrom && item.titleTo) {
          const titleMutation = await mutateSource(item, sourceFile, 'title')
          await waitForTitleHmrAfterMutation(page, item, sourceFile, titleMutation, hmrMessages, titleMessageStart)
          await expectPageSessionPreserved(page, item)
          expectNoViteFullReload(item, hmrMessages, titleMessageStart)
          expectViteSourceHmrUpdate(item, hmrMessages, titleMessageStart)
        }

        const classMessageStart = hmrMessages.length
        await mutateSource(item, sourceFile, 'class')
        if (item.classUpdateRequired === false) {
          await expectPageSessionPreserved(page, item)
          return
        }
        await waitForClassHmr(page, item, hmrMessages, classMessageStart)
        await expectPageSessionPreserved(page, item)
        if (!item.reloadAllowed) {
          expectNoViteFullReload(item, hmrMessages, classMessageStart)
        }
        expectViteSourceHmrUpdate(item, hmrMessages, classMessageStart)
        return
      }

      const messageStart = hmrMessages.length
      await mutateSource(item, sourceFile)
      await waitForDomHmr(page, item, hmrMessages, messageStart)
    })
  }, serverTimeoutMs + 30_000)

  it.each(webViteHmrCases)('adds modifies and removes Tailwind classes for $name', async (item) => {
    if (item.classFlowRequired === false) {
      return
    }
    const projectRoot = path.resolve(repoRoot, item.projectDir)
    const sourceFile = path.resolve(projectRoot, item.sourceFile)
    const port = await findFreePort()
    const child = createDevServer(item, projectRoot, port)
    const logs = collectProcessOutput(child)
    const baseUrl = await waitForReadyUrl(item, child, logs, `http://127.0.0.1:${port}/`)

    browser = await chromium.launch({
      executablePath: await resolveChromeExecutable(),
      headless: true,
    })
    const page = await browser.newPage()
    const original = await fs.readFile(sourceFile, 'utf8')
    const flow = createTailwindClassFlowMutation(item, original)
    await withWebHmrEvidence({
      artifactRoot: path.resolve(repoRoot, 'e2e/.artifacts/web-vite-hmr'),
      caseName: `${item.name}-class-flow`,
      page,
      projectRoot,
      selector: flow.selector,
      serverLogs: () => logs,
    }, async (capture) => {
      const hmrMessages = collectViteHmrMessages(page)
      restoreSource = async () => {
        await writeFilePreserveEol(sourceFile, original, original)
      }
      await page.goto(baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(serverTimeoutMs, 60_000),
      })
      await waitForInitialRender(page, item, baseUrl)
      await capture('before')
      await markPageSession(page)
      const targetSelector = flow.selector
      const readFlowState = async () => {
        return await page.locator(targetSelector).evaluate((element) => {
          const style = window.getComputedStyle(element)
          return {
            backgroundColor: style.backgroundColor.replace(/\s+/g, ' '),
            borderTopColor: style.borderTopColor.replace(/\s+/g, ' '),
            borderTopWidth: style.borderTopWidth,
            className: element.getAttribute('class') ?? '',
          }
        })
      }

      const originalState = await readFlowState()
      if (originalState.backgroundColor !== 'rgb(255, 255, 255)') {
        throw new Error(`${item.name} Web HMR class flow 初始样式不符合预期：${JSON.stringify(originalState)}`)
      }

      const addMessageStart = hmrMessages.length
      await measureHmrLatency(`${item.name} class add`, async () => {
        await writeFilePreserveEol(sourceFile, flow.addedSource, original)
        await waitForFlowElementStyle(page, item, flow.selector, {
          backgroundColor: 'rgb(255, 255, 255)',
          borderTopColor: 'rgb(0, 255, 0)',
          borderTopWidth: '1px',
          className: originalState.className.replace('bg-white', 'border border-[#00ff00] bg-white'),
        })
      })
      if (!item.reloadAllowed) {
        expectNoViteFullReload(item, hmrMessages, addMessageStart)
      }
      await expectPageSessionPreserved(page, item)

      await capture('class-added')

      const modifyMessageStart = hmrMessages.length
      await measureHmrLatency(`${item.name} class modify`, async () => {
        await writeFilePreserveEol(sourceFile, flow.modifiedSource, original)
        await waitForFlowElementStyle(page, item, flow.selector, {
          backgroundColor: 'rgb(255, 255, 255)',
          borderTopColor: 'rgb(255, 0, 170)',
          borderTopWidth: '1px',
          className: originalState.className.replace('bg-white', 'border border-[#ff00aa] bg-white'),
        })
      })
      if (!item.reloadAllowed) {
        expectNoViteFullReload(item, hmrMessages, modifyMessageStart)
      }
      await expectPageSessionPreserved(page, item)

      await capture('class-modified')

      const removeClassMessageStart = hmrMessages.length
      await measureHmrLatency(`${item.name} class remove`, async () => {
        await writeFilePreserveEol(sourceFile, flow.removedClassSource, original)
        await waitForFlowElementStyle(page, item, flow.selector, {
          backgroundColor: 'rgb(255, 255, 255)',
          borderTopColor: originalState.borderTopColor,
          borderTopWidth: originalState.borderTopWidth,
          className: originalState.className,
        })
      })
      if (!item.reloadAllowed) {
        expectNoViteFullReload(item, hmrMessages, removeClassMessageStart)
      }
      await expectPageSessionPreserved(page, item)

      await capture('class-removed')

      const rollbackMessageStart = hmrMessages.length
      await measureHmrLatency(`${item.name} class rollback`, async () => {
        await writeFilePreserveEol(sourceFile, original, original)
        await waitForFlowElementStyle(page, item, flow.selector, {
          backgroundColor: 'rgb(255, 255, 255)',
          borderTopColor: originalState.borderTopColor,
          borderTopWidth: originalState.borderTopWidth,
          className: originalState.className,
        })
      })
      if (!item.reloadAllowed) {
        expectNoViteFullReload(item, hmrMessages, rollbackMessageStart)
      }
      await expectPageSessionPreserved(page, item)
    })
  }, serverTimeoutMs + 30_000)
})
