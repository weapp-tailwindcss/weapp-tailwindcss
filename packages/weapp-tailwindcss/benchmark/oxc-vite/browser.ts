import type { Browser, Page } from 'playwright'
import type { PageState, Phase } from './types'
import assert from 'node:assert/strict'
import { ORIGINAL_TEXT, PROBE_MARKER, PROBE_SELECTOR, TEXT_MARKER } from './source'

export async function openBrowser(require: NodeJS.Require, errors: string[]) {
  const { chromium } = require('playwright') as typeof import('playwright')
  const browser: Browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await page.addInitScript(() => {
      Object.defineProperty(window, '__oxcViteSession', { value: crypto.randomUUID() })
    })
    return { browser, page }
  }
  catch (error) {
    await browser.close()
    throw error
  }
}

export async function capture(page: Page): Promise<PageState> {
  return page.evaluate(({ probeSelector, textMarker }) => {
    const heading = document.querySelector('h1')!
    const main = document.querySelector('main')!
    const button = document.querySelector('button')!
    const probe = document.querySelector(probeSelector)
    return {
      markup: document.querySelector('#app')!.innerHTML,
      heading: heading.textContent!.trim(),
      headingSize: getComputedStyle(heading).fontSize,
      headingLineHeight: getComputedStyle(heading).lineHeight,
      mainBackground: getComputedStyle(main).backgroundColor,
      buttonBackground: getComputedStyle(button).backgroundColor,
      textPresent: document.body.textContent!.includes(textMarker),
      probe: probe ? { text: probe.textContent!.trim(), width: getComputedStyle(probe).width, height: getComputedStyle(probe).height, background: getComputedStyle(probe).backgroundColor } : null,
      session: (window as unknown as Record<string, string>)['__oxcViteSession']!,
    }
  }, { probeSelector: PROBE_SELECTOR, textMarker: TEXT_MARKER })
}

export async function waitForState(page: Page, phase: Phase, timeout: number, session?: string) {
  await page.waitForFunction(({ phase, session, text, original, probe, probeText }) => {
    const heading = document.querySelector('h1')
    const main = document.querySelector('main')
    const button = document.querySelector('button')
    if (!heading || !main || !button || document.querySelector('vite-error-overlay')) {
      return false
    }
    if (session && (window as unknown as Record<string, string>)['__oxcViteSession'] !== session) {
      return false
    }
    const originalStyles = heading.textContent!.trim() === 'Vue Vite Tailwind CSS v4'
      && getComputedStyle(heading).fontSize === '32px'
      && getComputedStyle(heading).lineHeight === '38px'
      && getComputedStyle(main).backgroundColor === 'rgb(250, 250, 250)'
      && getComputedStyle(button).backgroundColor === 'rgb(43, 127, 255)'
    const hasText = document.body.textContent!.includes(text)
    const expectsText = ['text', 'add', 'remove'].includes(phase)
    if (!originalStyles || hasText !== expectsText || !document.body.textContent!.includes(original)) {
      return false
    }
    const element = document.querySelector(probe)
    return phase === 'add'
      ? element?.textContent!.trim() === probeText
      && getComputedStyle(element).width === '137px'
      && getComputedStyle(element).height === '29px'
      && getComputedStyle(element).backgroundColor === 'rgb(19, 87, 155)'
      : element === null
  }, { phase, session, text: TEXT_MARKER, original: ORIGINAL_TEXT, probe: PROBE_SELECTOR, probeText: PROBE_MARKER }, { timeout, polling: 20 })
  const state = await capture(page)
  if (session) {
    assert.equal(state.session, session, 'HMR 被整页 reload 替代。')
  }
  return state
}

export function canonicalState({ session: _session, ...state }: PageState) {
  return state
}
