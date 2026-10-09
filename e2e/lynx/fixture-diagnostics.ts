import type { CDPSession, Page } from 'playwright'
import type { PngPixels } from './png'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { repoRoot } from './catalog'
import { PNG } from './png'

interface DiagnosticError {
  name: string
  message: string
  stack?: string
}

interface NodeDiagnostic {
  tag: string
  id: string
  className: string
  text: string | null
  bounds: { x: number, y: number, width: number, height: number }
  styles: Record<string, string>
  fonts?: Array<{ familyName: string, postScriptName: string, isCustomFont: boolean, glyphCount: number }>
}

interface FrameDiagnostic {
  frame: string
  phase: string
  selector: string
  screenshot: string
  width: number
  height: number
  devicePixelRatio?: number
  colorScheme?: string
  userAgent?: string
  fontStatus?: string
  nodes?: NodeDiagnostic[]
  diagnosticError?: DiagnosticError
}

function describeError(error: unknown): DiagnosticError {
  if (error instanceof Error) {
    return error.stack
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: error.name, message: error.message }
  }
  return { name: 'Error', message: String(error) }
}

async function collectPlatformFonts(page: Page, selector: string, nodes: NodeDiagnostic[]) {
  let session: CDPSession | undefined
  try {
    session = await page.context().newCDPSession(page)
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument')
    const { nodeIds } = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: `${selector}, ${selector} *` })
    for (const [index, nodeId] of nodeIds.entries()) {
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId })
      if (nodes[index]) {
        nodes[index].fonts = fonts
      }
    }
  }
  finally {
    await session?.detach()
  }
}

/** 在校验阶段保存原始像素与渲染环境，诊断失败不得替换夹具的校验异常。 */
export function createFixtureDiagnostics(page: Page, options: { directory?: string, name: string, caseId: string }) {
  const directory = options.directory ?? path.join(repoRoot, 'e2e', '.artifacts', 'lynx-static')
  const report = {
    caseId: options.caseId,
    status: 'running' as 'running' | 'passed' | 'failed',
    environment: {
      browser: page.context().browser()?.version(),
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      node: process.version,
      viewport: page.viewportSize(),
    },
    frames: [] as FrameDiagnostic[],
    error: undefined as DiagnosticError | undefined,
  }

  async function writeDiagnostics(write: () => Promise<unknown>) {
    try {
      await fs.mkdir(directory, { recursive: true })
      await write()
    }
    catch (error) {
      // 诊断写入是附加证据，不能覆盖原始夹具异常。
      // eslint-disable-next-line no-console
      console.warn('Lynx 诊断写入失败', error)
    }
  }

  function saveReport() {
    return writeDiagnostics(() => fs.writeFile(path.join(directory, `${options.name}.json`), `${JSON.stringify(report, null, 2)}\n`))
  }

  async function capture(frame: string, selector: string, phase = 'baseline'): Promise<PngPixels> {
    const locator = page.locator(selector)
    await page.evaluate(() => document.fonts.ready)
    const bytes = await locator.screenshot()
    const pixels = PNG.sync.read(bytes)
    const diagnostic: FrameDiagnostic = {
      frame,
      phase,
      selector,
      screenshot: `${options.name}-${phase}-${frame}.png`,
      width: pixels.width,
      height: pixels.height,
    }
    report.frames.push(diagnostic)
    await writeDiagnostics(() => fs.writeFile(path.join(directory, diagnostic.screenshot), bytes))
    try {
      Object.assign(diagnostic, await locator.evaluate((root) => {
        const properties = [
          'font-family',
          'font-size',
          'font-weight',
          'font-style',
          'font-stretch',
          'font-kerning',
          'font-feature-settings',
          'font-variation-settings',
          'line-height',
          'letter-spacing',
          'color',
          'background-color',
          'opacity',
          'display',
          'white-space',
          'vertical-align',
          'text-align',
          'text-transform',
          'width',
          'height',
          'padding',
          'margin',
          'box-sizing',
          'transform',
        ]
        return {
          devicePixelRatio: window.devicePixelRatio,
          colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          userAgent: navigator.userAgent,
          fontStatus: document.fonts.status,
          nodes: [root, ...root.querySelectorAll('*')].map((node) => {
            const styles = getComputedStyle(node)
            const bounds = node.getBoundingClientRect()
            return {
              tag: node.tagName,
              id: node.id,
              className: node.getAttribute('class') ?? '',
              text: node.textContent,
              bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
              styles: Object.fromEntries(properties.map(property => [property, styles.getPropertyValue(property)])),
            }
          }),
        }
      }))
      await collectPlatformFonts(page, selector, diagnostic.nodes!)
    }
    catch (error) {
      diagnostic.diagnosticError = describeError(error)
    }
    await saveReport()
    return pixels
  }

  async function verify<T>(callback: () => Promise<T>): Promise<T> {
    try {
      const result = await callback()
      report.status = 'passed'
      await saveReport()
      return result
    }
    catch (error) {
      report.status = 'failed'
      report.error = describeError(error)
      await saveReport()
      throw error
    }
  }

  return { capture, verify }
}
