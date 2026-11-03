import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSourceOnlyRuntime, resolveSourceOnlyFiles } from './hbuilderx-local/source-only'

let root: string
let sourceFile: string
let outputRoot: string
let externalFile: string
let host: Parameters<typeof createSourceOnlyRuntime<{ color: string }>>[0]

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hbuilderx-source-only-'))
  sourceFile = path.join(root, 'Page.uvue')
  externalFile = path.join(root, 'external.css')
  outputRoot = path.join(root, 'dist')
  await fs.mkdir(outputRoot)
  await fs.writeFile(sourceFile, '<template><view>stable marker</view></template>')
  await fs.writeFile(externalFile, '.target{color:red}')
  await fs.writeFile(path.join(outputRoot, 'app.js'), 'old output')
  host = {
    projectRoot: root,
    sourceFile,
    outputRoot,
    sourceFiles: ['external.css'],
    timeoutMs: 1000,
    ensureRunning: vi.fn(),
    begin: vi.fn(() => ({
      assertNoFallback: vi.fn(),
      snapshot: () => ({ mode: 'hmr', state: 'updated' }),
      waitForCompletion: async (_timeout, ensure, verify) => {
        ensure()
        return verify(1000, 'current-transfer')
      },
    })),
    capture: vi.fn(async () => {
      await fs.writeFile(path.join(outputRoot, 'app.js'), 'new output')
      return { color: 'blue' }
    }),
    publish: vi.fn(),
  }
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const update = () => ({ name: 'replace', file: 'external.css', source: '.target{color:blue}', verifyRuntime: (evidence: { color: string }) => evidence.color === 'blue' })

it('只保存外部 CSS，保留父 SFC 原字节并以新运行态和产物证明更新', async () => {
  const original = await fs.readFile(sourceFile)
  const controller = await createSourceOnlyRuntime(host)
  await controller.runtime.updateSourceOnly(update())
  await controller.finish()
  expect(await fs.readFile(sourceFile)).toEqual(original)
  expect(await fs.readFile(externalFile, 'utf8')).toBe('.target{color:blue}')
  expect(host.capture).toHaveBeenCalledWith('replace', 1, expect.any(Number), 'current-transfer')
  expect(host.publish).toHaveBeenCalledWith('replace', { color: 'blue' }, { mode: 'hmr', state: 'updated' }, { 'app.js': expect.stringMatching(/^[a-f0-9]{64}$/) })
})

it('旧节点颜色仍在时继续采当轮截图，不接受第一次旧截图', async () => {
  host.capture = vi.fn().mockResolvedValueOnce({ color: 'red' }).mockImplementation(async () => {
    await fs.writeFile(path.join(outputRoot, 'app.js'), 'new output')
    return { color: 'blue' }
  })
  const controller = await createSourceOnlyRuntime(host)
  await controller.runtime.updateSourceOnly(update())
  await controller.finish()
  expect(host.capture).toHaveBeenCalledTimes(2)
})

it('运行态正确但原生产物未改变仍失败，回调吞错也不能放行', async () => {
  host.capture = vi.fn(async () => ({ color: 'blue' }))
  const controller = await createSourceOnlyRuntime(host)
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow('未改变任何原生产物')
  await expect(controller.runtime.updateSourceOnly({ ...update(), source: 'must not save again' })).rejects.toThrow('未改变任何原生产物')
  expect(await fs.readFile(externalFile, 'utf8')).toBe('.target{color:blue}')
  await expect(controller.finish()).rejects.toThrow('未改变任何原生产物')
  expect(host.publish).not.toHaveBeenCalled()
})

it('父 SFC 的异步改写使本步与最终窗口均失败', async () => {
  host.capture = vi.fn(async () => {
    await fs.writeFile(sourceFile, 'unexpected parent save')
    return { color: 'blue' }
  })
  const controller = await createSourceOnlyRuntime(host)
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow()
  await expect(controller.finish()).rejects.toThrow('父 SFC 身份检查')
  expect(host.publish).not.toHaveBeenCalled()
})

it('未登记的文件和 marker SFC 不得被保存', async () => {
  const controller = await createSourceOnlyRuntime(host)
  await expect(controller.runtime.updateSourceOnly({ ...update(), file: 'Page.uvue' })).rejects.toThrow('未登记')
  expect(await fs.readFile(sourceFile, 'utf8')).toContain('stable marker')
  await expect(controller.finish()).rejects.toThrow('未登记')
  expect(() => resolveSourceOnlyFiles(root, sourceFile, ['../outside.css'])).toThrow('项目外文件')
  expect(() => resolveSourceOnlyFiles(root, sourceFile, ['Page.uvue'])).toThrow('marker SFC')
})

it('取证前后均执行原生存活与 fallback 门禁', async () => {
  let stopped = false
  host.ensureRunning = () => {
    if (stopped) {
      throw new Error('native stopped')
    }
  }
  host.capture = async () => {
    stopped = true
    return { color: 'blue' }
  }
  const controller = await createSourceOnlyRuntime(host)
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow('native stopped')
  await expect(controller.finish()).rejects.toThrow('native stopped')
  expect(host.publish).not.toHaveBeenCalled()
})

it('未等待的任务也必须结算后才能结束窗口，已结算窗口拒绝后续写入', async () => {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  host.capture = async () => {
    await wait
    await fs.writeFile(path.join(outputRoot, 'app.js'), 'new output')
    return { color: 'blue' }
  }
  const controller = await createSourceOnlyRuntime(host)
  const pending = controller.runtime.updateSourceOnly(update())
  const finish = controller.finish()
  let finished = false
  void finish.then(() => {
    finished = true
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(finished).toBe(false)
  release()
  await pending
  await finish
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow('窗口已结束')
})

it('并发更新被拒绝并保留失败，不能让覆盖的 Promise 逃出收尾', async () => {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  host.capture = async () => {
    await wait
    await fs.writeFile(path.join(outputRoot, 'app.js'), 'new output')
    return { color: 'blue' }
  }
  const controller = await createSourceOnlyRuntime(host)
  const pending = controller.runtime.updateSourceOnly(update())
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow('必须串行')
  release()
  await pending
  await expect(controller.finish()).rejects.toThrow('必须串行')
})

it.each([undefined, null, 0, false, ''])('保留 falsy 拒绝值 %s，不能被回调或收尾吞掉', async (error) => {
  const controller = await createSourceOnlyRuntime(host)
  await expect(controller.runtime.updateSourceOnly({
    ...update(),
    verifyRuntime: () => {
      throw error
    },
  })).rejects.toBe(error)
  await expect(controller.finish()).rejects.toBe(error)
  expect(host.publish).not.toHaveBeenCalled()
})

it.each([
  { paths: path.posix, root: '/project', marker: '/project/Page.uvue', valid: './styles/external.css', invalid: '../outside.css', expected: '/project/styles/external.css' },
  { paths: path.win32, root: 'C:\\project', marker: 'C:\\project\\Page.uvue', valid: '.\\styles\\external.css', invalid: 'D:\\outside.css', expected: 'C:\\project\\styles\\external.css' },
  { paths: path.win32, root: '\\\\server\\share\\project', marker: '\\\\server\\share\\project\\Page.uvue', valid: 'styles\\external.css', invalid: '\\\\other\\share\\outside.css', expected: '\\\\server\\share\\project\\styles\\external.css' },
])('使用平台路径 API 验证相对来源及根边界：$root', ({ paths, root, marker, valid, invalid, expected }) => {
  expect(resolveSourceOnlyFiles(root, marker, [valid], paths)).toEqual([expected])
  expect(() => resolveSourceOnlyFiles(root, marker, [invalid], paths)).toThrow('项目外文件')
  expect(() => resolveSourceOnlyFiles(root, marker, [marker], paths)).toThrow('marker SFC')
})

it('Windows marker 路径大小写变化不能绕过同文件保护', () => {
  expect(() => resolveSourceOnlyFiles('C:\\project', 'C:\\project\\Page.uvue', ['c:\\PROJECT\\page.uvue'], path.win32)).toThrow('marker SFC')
})

it('重复步骤名不能覆盖首次运行态证据', async () => {
  const controller = await createSourceOnlyRuntime(host)
  await controller.runtime.updateSourceOnly(update())
  await expect(controller.runtime.updateSourceOnly(update())).rejects.toThrow('保留首次证据')
  await expect(controller.finish()).rejects.toThrow('保留首次证据')
  expect(host.publish).toHaveBeenCalledTimes(1)
})
