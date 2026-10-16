import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertImage, command } from '../scripts/e2e-preflight/io'
import { harmony } from '../scripts/e2e-preflight/probes/native'

vi.mock('../scripts/e2e-preflight/io', async original => ({ ...await original<object>(), command: vi.fn() }))
const run = vi.mocked(command)
const dirs: string[] = []
const toolAliases = ['DEMO_VISUAL_HARMONY_HDC_PATH', 'E2E_HBUILDERX_HARMONY_HDC_PATH', 'HDC_PATH']
const deviceAliases = ['E2E_HBUILDERX_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID']
const fixture = { command: path.join(os.tmpdir(), 'synthetic-preflight-hdc'), device: 'synthetic-harmony-device' }
const context: ProbeContext = { root: process.cwd(), dir: process.cwd(), runId: 'synthetic-harmony', url: 'http://127.0.0.1:1', phase: 'live' }

function bindSyntheticHarmony() {
  // 工具与设备是同一个夹具身份，必须覆盖预检会注入的所有别名。
  for (const key of toolAliases) {
    vi.stubEnv(key, fixture.command)
  }
  for (const key of deviceAliases) {
    vi.stubEnv(key, fixture.device)
  }
}

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('Harmony 合成探针的工具与设备边界', () => {
  it.each([false, true])('Harmony screenCap 回退保留 JPEG，完整宿主预选=%s', async (prebound) => {
    // 宿主输入独立于夹具覆盖，遗漏任何别名时普通 CI 也会复现冲突。
    for (const [key, value] of Object.entries({
      HDC_PATH: 'host-preselected-hdc',
      E2E_HBUILDERX_HARMONY_HDC_PATH: 'host-preselected-hdc',
      DEMO_VISUAL_HARMONY_HDC_PATH: 'host-preselected-hdc',
      E2E_HBUILDERX_HARMONY_DEVICE_ID: 'host-preselected-device',
      DEMO_VISUAL_HARMONY_DEVICE_ID: 'host-preselected-device',
      DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID: 'host-preselected-device',
    })) {
      vi.stubEnv(key, prebound ? value : undefined)
    }
    bindSyntheticHarmony()
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-preflight-harmony-'))
    dirs.push(dir)
    const remote = `/data/local/tmp/wt-preflight-${context.runId}`
    const layout = path.join(dir, 'harmony-ui.json')
    const screenshot = path.join(dir, 'harmony.jpeg')
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x0A, 0x00, 0x0A, 0x01, 0x01, 0x11, 0x00])
    run.mockImplementation(async (file, args) => {
      expect(file).toBe(fixture.command)
      if (args[0] === 'version') {
        expect(args).toEqual(['version'])
        return 'synthetic hdc 1'
      }
      if (args[0] === 'list') {
        expect(args).toEqual(['list', 'targets'])
        return fixture.device
      }
      expect(args.slice(0, 2)).toEqual(['-t', fixture.device])
      const operation = args.slice(2)
      if (operation[0] === 'file') {
        const target = args.at(-1)
        if (target === layout) {
          expect(operation).toEqual(['file', 'recv', `${remote}.json`, layout])
          await writeFile(layout, '{"root":{"type":"root"}}')
          return ''
        }
        if (target === screenshot) {
          expect(operation).toEqual(['file', 'recv', `${remote}.jpeg`, screenshot])
          await writeFile(screenshot, jpeg)
          return ''
        }
      }
      if (operation[0] === 'shell') {
        if (operation[1] === 'param') {
          expect(operation).toEqual(['shell', 'param', 'get', 'const.ohos.fullname'])
          return 'OpenHarmony synthetic 6.0'
        }
        if (operation[1] === 'uitest') {
          if (operation[2] === 'screenCap') {
            expect(operation).toEqual(['shell', 'uitest', 'screenCap', '-p', `${remote}.png`])
            throw new Error('Failed to get display pixelMap')
          }
          expect(operation).toEqual(['shell', 'uitest', 'dumpLayout', '-p', `${remote}.json`])
          return ''
        }
        if (operation[1] === 'snapshot_display') {
          expect(operation).toEqual(['shell', 'snapshot_display', '-f', `${remote}.jpeg`])
          return ''
        }
        if (operation[1] === 'rm') {
          expect(operation).toEqual(['shell', 'rm', '-f', `${remote}.json`, `${remote}.png`, `${remote}.jpeg`])
          return ''
        }
      }
      throw new Error(`未预期的合成 Harmony 命令：${JSON.stringify(args)}`)
    })
    const result = await harmony({ ...context, dir, phase: 'prepare' })
    expect(result.binding).toEqual({ ...fixture, version: 'synthetic hdc 1', system: 'OpenHarmony synthetic 6.0' })
    expect(result.evidence).toEqual([layout, screenshot])
    expect(run.mock.calls.some(([, args]) => args.includes('snapshot_display'))).toBe(true)
    // 回退会捕获 screenCap 内部错误，完整参数须在回退结束后独立核对。
    expect(run).toHaveBeenCalledWith(fixture.command, ['-t', fixture.device, 'shell', 'uitest', 'screenCap', '-p', `${remote}.png`])
    expect(run).toHaveBeenLastCalledWith(fixture.command, ['-t', fixture.device, 'shell', 'rm', '-f', `${remote}.json`, `${remote}.png`, `${remote}.jpeg`])
    await expect(assertImage(screenshot)).resolves.toBeUndefined()
  })

  it.each(toolAliases)('工具别名 %s 冲突时不执行命令', async (key) => {
    bindSyntheticHarmony()
    vi.stubEnv(key, 'conflicting-synthetic-hdc')
    await expect(harmony(context)).rejects.toThrow('歧义')
    expect(run).not.toHaveBeenCalled()
  })

  it.each(deviceAliases)('设备别名 %s 冲突时不访问设备', async (key) => {
    bindSyntheticHarmony()
    vi.stubEnv(key, 'conflicting-synthetic-device')
    run.mockImplementation(async (file, args) => {
      expect(file).toBe(fixture.command)
      if (args.length === 1 && args[0] === 'version') {
        return 'synthetic hdc 1'
      }
      expect(args).toEqual(['list', 'targets'])
      return fixture.device
    })
    await expect(harmony(context)).rejects.toThrow('歧义')
    expect(run.mock.calls).toEqual([
      [fixture.command, ['version']],
      [fixture.command, ['list', 'targets']],
    ])
  })
})
