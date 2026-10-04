import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTemplatePageConfig } from './template-ide/config'
import { assertTemplatePageRendered } from './template-ide/runtime'

describe('template page config contract', () => {
  let dir: string
  let source: string
  let output: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'template-config-'))
    source = path.join(dir, 'source.json')
    output = path.join(dir, 'output.json')
  })
  afterEach(async () => rm(dir, { recursive: true, force: true }))

  it('accepts an omitted native config only when its source is an empty object', async () => {
    await writeFile(source, '{}')
    await expect(readTemplatePageConfig(output, source)).resolves.toEqual({})
    await expect(readTemplatePageConfig(output)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['{"usingComponents":{"card":"./card"}}', '{"navigationBarTitleText":"Title"}'])('rejects missing non-empty config: %s', async (config) => {
    await writeFile(source, config)
    await expect(readTemplatePageConfig(output, source)).rejects.toThrow('非空页面配置')
  })

  it.each(['null', '[]', 'invalid'])('rejects invalid source config: %s', async (config) => {
    await writeFile(source, config)
    await expect(readTemplatePageConfig(output, source)).rejects.toThrow()
  })

  it('rejects missing source and malformed output even with an empty source', async () => {
    await expect(readTemplatePageConfig(output, source)).rejects.toMatchObject({ code: 'ENOENT' })
    await writeFile(source, '{}')
    await writeFile(output, 'invalid')
    await expect(readTemplatePageConfig(output, source)).rejects.toThrow()
  })

  it('retains emitted component references for artifact checks', async () => {
    await writeFile(output, '{"usingComponents":{"card":"./card"}}')
    await expect(readTemplatePageConfig(output)).resolves.toEqual({ usingComponents: { card: './card' } })
  })
})

describe('template IDE runtime contract', () => {
  const measured = [{ width: 390, height: 753 }]
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function fixture(route: unknown = 'index') {
    const page = {
      path: route,
      waitForRendered: vi.fn().mockRejectedValue(new Error('legacy Page.getElement must not run')),
      renderedNodes: vi.fn().mockResolvedValue(measured),
    }
    const reLaunch = vi.fn().mockResolvedValue(page)
    const miniProgram = { reLaunch } as unknown as Pick<MiniProgram, 'reLaunch'>
    return { page, reLaunch, miniProgram }
  }

  it('保留 reLaunch，直接以公开查询的当次正尺寸节点验收，不调用旧查询或额外测量', async () => {
    const { page, reLaunch, miniProgram } = fixture()
    await expect(assertTemplatePageRendered(miniProgram, '/index')).resolves.toEqual(measured)
    expect(reLaunch).toHaveBeenCalledExactlyOnceWith('/index')
    expect(page.waitForRendered).not.toHaveBeenCalled()
    expect(page.renderedNodes).toHaveBeenCalledExactlyOnceWith('.min-h-screen', { componentSelectors: ['comp'], timeout: 5000 })
  })

  it('接受 SDK 返回的单个前导斜线，不改变大小写或非目标路由', async () => {
    const { miniProgram } = fixture('/index')
    await expect(assertTemplatePageRendered(miniProgram, '/index')).resolves.toEqual(measured)
  })

  it('请求 query 与 SDK 页面 route 分离，只移除一个前导斜线', async () => {
    const { reLaunch, miniProgram } = fixture('index')
    await expect(assertTemplatePageRendered(miniProgram, '/index?scene=a')).resolves.toEqual(measured)
    expect(reLaunch).toHaveBeenCalledExactlyOnceWith('/index?scene=a')
  })

  it('导航协议错误原样传播，不能以已测量的旧页兜底', async () => {
    const { page, reLaunch, miniProgram } = fixture()
    const error = new Error('App.getPageStack timeout')
    reLaunch.mockRejectedValue(error)
    await expect(assertTemplatePageRendered(miniProgram, '/index')).rejects.toBe(error)
    expect(page.renderedNodes).not.toHaveBeenCalled()
  })

  it('缺少返回页面时立即失败', async () => {
    const { reLaunch, miniProgram } = fixture()
    reLaunch.mockResolvedValue(undefined)
    await expect(assertTemplatePageRendered(miniProgram, '/index')).rejects.toThrow('未进入页面')
  })

  it.each(['other', 'other/index', 'index/nested', 'Index', '', undefined, '/index/', '//index', 'other?scene=a'])('返回路由 %s 不匹配时零渲染请求', async (route) => {
    const { page, miniProgram } = fixture(null)
    page.path = route
    await expect(assertTemplatePageRendered(miniProgram, '/index')).rejects.toThrow('路由不匹配')
    expect(page.waitForRendered).not.toHaveBeenCalled()
    expect(page.renderedNodes).not.toHaveBeenCalled()
  })

  it('空节点与零尺寸可以等待后续真实渲染，220ms 才查询下一次', async () => {
    const { page, miniProgram } = fixture()
    page.renderedNodes.mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 0, height: 100 }])
    const result = assertTemplatePageRendered(miniProgram, '/index').then(nodes => ({ nodes }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(219)
    expect(page.renderedNodes).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(page.renderedNodes).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(220)
    expect(await result).toEqual({ nodes: measured })
    expect(page.renderedNodes).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { nodes: [] },
    { nodes: [{ width: 0, height: 100 }] },
    { nodes: [{ width: 100, height: 0 }] },
    { nodes: [{ width: 100 }] },
    { nodes: [{ width: -1, height: 100 }] },
    { nodes: [{ width: Number.NaN, height: 100 }] },
    { nodes: [{ width: 100, height: Number.POSITIVE_INFINITY }] },
    { nodes: [{ width: '100', height: 100 }] },
    { nodes: [null] },
    { nodes: null },
  ])('无效尺寸不能通过，15秒截止后不留下 timer 或再发请求：$nodes', async ({ nodes }) => {
    const { page, miniProgram } = fixture()
    page.renderedNodes.mockResolvedValue(nodes)
    const result = assertTemplatePageRendered(miniProgram, '/index').then(nodes => ({ nodes }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toEqual({ error: expect.objectContaining({ message: expect.stringContaining('未产生渲染内容') }) })
    const count = page.renderedNodes.mock.calls.length
    expect(count).toBeGreaterThan(1)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(page.renderedNodes).toHaveBeenCalledTimes(count)
  })

  it('协议异常立即原样传播，既不重试也不回退旧查询', async () => {
    const { page, miniProgram } = fixture()
    const error = new Error('App.callFunction timeout')
    page.renderedNodes.mockRejectedValue(error)
    await expect(assertTemplatePageRendered(miniProgram, '/index')).rejects.toBe(error)
    expect(page.renderedNodes).toHaveBeenCalledOnce()
    expect(page.waitForRendered).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('每次查询只使用剩余预算，最后一次不能重新取得完整5秒', async () => {
    const { page, miniProgram } = fixture()
    const requests: Array<{ at: number, timeout: number }> = []
    page.renderedNodes.mockImplementation(async (_selector, options) => {
      requests.push({ at: Date.now(), timeout: options.timeout })
      await new Promise(resolve => setTimeout(resolve, options.timeout))
      return []
    })
    const result = assertTemplatePageRendered(miniProgram, '/index').then(nodes => ({ nodes }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toEqual({ error: expect.objectContaining({ message: expect.stringContaining('未产生渲染内容') }) })
    expect(requests).toEqual([{ at: 0, timeout: 5000 }, { at: 5220, timeout: 5000 }, { at: 10440, timeout: 4560 }])
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(page.renderedNodes).toHaveBeenCalledTimes(3)
  })

  it('即使 SDK 晚返回正尺寸，超过截止时间也不得验收成功', async () => {
    const { page, miniProgram } = fixture()
    page.renderedNodes.mockImplementation(async () => {
      vi.setSystemTime(15_001)
      return measured
    })
    await expect(assertTemplatePageRendered(miniProgram, '/index')).rejects.toThrow('未产生渲染内容')
    expect(page.renderedNodes).toHaveBeenCalledOnce()
  })
})
