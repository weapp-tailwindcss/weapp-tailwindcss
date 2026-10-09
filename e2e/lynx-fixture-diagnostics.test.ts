import type { Browser } from 'playwright'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createFixtureDiagnostics } from './lynx/fixture-diagnostics'
import { PNG } from './lynx/png'
import { evaluateStructural } from './lynx/structural'

let browser: Browser
const directories: string[] = []

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(browser.contexts().map(context => context.close()))
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

afterAll(async () => {
  await browser?.close()
})

async function artifactDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-fixture-diagnostics-'))
  directories.push(directory)
  return directory
}

describe('Lynx 浏览器夹具诊断', () => {
  it('原始 PNG 与同阶段的真实字体、DPR、样式和尺寸一起保存', async () => {
    const directory = await artifactDirectory()
    const page = await browser.newPage({ deviceScaleFactor: 2.625 })
    await page.setContent('<div id="canvas" style="width:160px;height:160px;background:#f7fafb"><span style="font:32px serif;color:#132026">Tw4</span></div>')
    await page.evaluate(() => document.fonts.ready)
    const diagnostics = createFixtureDiagnostics(page, { directory, name: 'structural-2.625', caseId: 'variant-structural' })
    await diagnostics.verify(async () => {
      const captured = await diagnostics.capture('control', '#canvas')
      const raw = PNG.sync.read(await fs.readFile(path.join(directory, 'structural-2.625-baseline-control.png')))
      expect(captured.width).toBe(420)
      expect(captured.height).toBe(420)
      expect(raw.data).toEqual(captured.data)
    })
    const report = JSON.parse(await fs.readFile(path.join(directory, 'structural-2.625.json'), 'utf8'))
    expect(report.status).toBe('passed')
    expect(report.environment).toMatchObject({ browser: browser.version(), platform: process.platform, node: process.version })
    expect(report.frames[0]).toMatchObject({
      frame: 'control',
      phase: 'baseline',
      selector: '#canvas',
      screenshot: 'structural-2.625-baseline-control.png',
      width: 420,
      height: 420,
      devicePixelRatio: 2.625,
    })
    expect(report.frames[0].nodes[0].bounds).toMatchObject({ width: 160, height: 160 })
    expect(report.frames[0].nodes[1].styles).toMatchObject({ 'font-size': '32px', 'color': 'rgb(19, 32, 38)' })
    expect(report.frames[0].nodes[1].fonts).toEqual(expect.arrayContaining([
      expect.objectContaining({ familyName: expect.any(String), glyphCount: expect.any(Number) }),
    ]))
  })

  it('坏画布仍被严格像素校验拒绝，失败时保存错误和原图', async () => {
    const directory = await artifactDirectory()
    const page = await browser.newPage()
    await page.setContent('<div id="canvas" style="width:160px;height:160px;background:red">Tw4</div>')
    const diagnostics = createFixtureDiagnostics(page, { directory, name: 'invalid-control', caseId: 'variant-structural' })
    await expect(diagnostics.verify(async () => {
      const image = await diagnostics.capture('control', '#canvas')
      evaluateStructural([image, image, image])
    })).rejects.toThrow('结构选择器普通文字或画布对照无效')
    const report = JSON.parse(await fs.readFile(path.join(directory, 'invalid-control.json'), 'utf8'))
    expect(report.status).toBe('failed')
    expect(report.error.message).toContain('结构选择器普通文字或画布对照无效')
    expect(report.error.stack).toContain('evaluateStructural')
    expect(await fs.readFile(path.join(directory, report.frames[0].screenshot))).not.toHaveLength(0)
  })

  it('分阶段保存颜色切换，后续截图不能覆盖原始浅色帧', async () => {
    const directory = await artifactDirectory()
    const page = await browser.newPage({ colorScheme: 'light' })
    await page.setContent('<style>#canvas{width:160px;height:160px;background:red}@media(prefers-color-scheme:dark){#canvas{background:blue}}</style><div id="canvas">Tw4</div>')
    const diagnostics = createFixtureDiagnostics(page, { directory, name: 'dark-1', caseId: 'variant-dark' })
    await diagnostics.verify(async () => {
      await diagnostics.capture('probe', '#canvas', 'light')
      const original = await fs.readFile(path.join(directory, 'dark-1-light-probe.png'))
      await page.emulateMedia({ colorScheme: 'dark' })
      await diagnostics.capture('probe', '#canvas', 'dark')
      expect(await fs.readFile(path.join(directory, 'dark-1-light-probe.png'))).toEqual(original)
      expect(await fs.readFile(path.join(directory, 'dark-1-dark-probe.png'))).not.toEqual(original)
    })
    const report = JSON.parse(await fs.readFile(path.join(directory, 'dark-1.json'), 'utf8'))
    expect(report.frames.map((frame: { phase: string, colorScheme: string }) => [frame.phase, frame.colorScheme])).toEqual([
      ['light', 'light'],
      ['dark', 'dark'],
    ])
  })

  it('字体探针故障记录为诊断缺证，不掩盖原校验异常', async () => {
    const directory = await artifactDirectory()
    const page = await browser.newPage()
    await page.setContent('<div id="canvas" style="width:160px;height:160px">Tw4</div>')
    vi.spyOn(page.context(), 'newCDPSession').mockRejectedValue(new Error('字体探针不可用'))
    const failure = new Error('原始像素校验失败')
    const diagnostics = createFixtureDiagnostics(page, { directory, name: 'font-probe-failed', caseId: 'variant-structural' })
    await expect(diagnostics.verify(async () => {
      await diagnostics.capture('control', '#canvas')
      throw failure
    })).rejects.toBe(failure)
    const report = JSON.parse(await fs.readFile(path.join(directory, 'font-probe-failed.json'), 'utf8'))
    expect(report.error.message).toBe(failure.message)
    expect(report.frames[0].diagnosticError.message).toBe('字体探针不可用')
    expect(report.frames[0].screenshot).toBe('font-probe-failed-baseline-control.png')
  })

  it('诊断目录写入失败也不能替换原校验异常', async () => {
    const directory = await artifactDirectory()
    const occupiedPath = path.join(directory, 'occupied')
    await fs.writeFile(occupiedPath, '已有文件')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = await browser.newPage()
    const failure = new Error('原始校验失败')
    const diagnostics = createFixtureDiagnostics(page, { directory: occupiedPath, name: 'write-failed', caseId: 'variant-dark' })
    await expect(diagnostics.verify(async () => {
      throw failure
    })).rejects.toBe(failure)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Lynx 诊断写入失败'), expect.any(Error))
  })
})
