import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { webCases } from './hbuilderx-local/cases'
import { withIssue1144Setup } from './hbuilderx-local/issue-1144-source'
import { cleanupWebHmrSession } from './hbuilderx-local/web/cleanup'
import { assertServerIdentity, sameSourceFile } from './hbuilderx-local/web/identity'
import { rewriteHmrMarker } from './hbuilderx-local/web/source'
import config from './vitest.e2e.config'

it.each(['编译器版本：', 'Compiler version: '])('Web 编译器身份接受 IDE 本地化日志：%s', (prefix) => {
  const item = webCases.find(item => item.name === 'issue-1144-uni-app-x-web')!
  const compiler = item.serverLogContains?.find(entry => entry instanceof RegExp && entry.source.includes('VDOM')) as RegExp
  expect(`${prefix}5.24（uni-app x）VDOM模式`).toMatch(compiler)
  expect(`${prefix}5.24（uni-app x）Vapor模式`).not.toMatch(compiler)
  expect(`${prefix}4.24（uni-app x）VDOM模式`).not.toMatch(compiler)
})

it('alpha setup 运行失败后恢复 App 与页面的原始内容', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'issue-1144-setup-'))
  const page = path.join(root, 'pages', 'index', 'index.uvue')
  const app = path.join(root, 'App.uvue')
  const original = '<template><view /></template><script lang="uts">export default {}</script><style>// author</style>'
  try {
    await mkdir(path.dirname(page), { recursive: true })
    await writeFile(app, original)
    await writeFile(page, original)
    await expect(withIssue1144Setup(root, async () => {
      expect(await readFile(page, 'utf8')).toContain('import PtProbe')
      expect(await readFile(app, 'utf8')).toContain('onLaunch(')
      expect(await readFile(page, 'utf8')).toContain('<style>// author</style>')
      throw new Error('模拟运行失败')
    })).rejects.toThrow('模拟运行失败')
    expect(await readFile(app, 'utf8')).toBe(original)
    expect(await readFile(page, 'utf8')).toBe(original)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('E2E 默认不写入快照', () => {
  expect(config.test?.update).toBe('none')
})

it.each([
  { paths: path.posix, root: '/repo', source: '/repo/pages/index.uvue', relative: './pages/../pages/index.uvue', other: '/other' },
  { paths: path.win32, root: 'C:\\repo', source: 'C:\\repo\\pages\\index.uvue', relative: '.\\pages\\..\\pages\\index.uvue', other: 'D:\\repo' },
])('服务身份与同文件写入使用文件系统路径：$root', ({ paths, root, source, relative, other }) => {
  expect(sameSourceFile(root, relative, source, paths)).toBe(true)
  expect(sameSourceFile(root, paths.join(other, 'pages', 'index.uvue'), source, paths)).toBe(false)
  expect(() => assertServerIdentity({ root: paths.join(root, 'pages', '..') }, root, paths)).not.toThrow()
  expect(() => assertServerIdentity({ root: other }, root, paths)).toThrow('身份不匹配')
  expect(() => assertServerIdentity({ root: 'repo' }, root, paths)).toThrow('身份不匹配')
  expect(() => assertServerIdentity(null, root, paths)).toThrow('身份不匹配')
  expect(() => assertServerIdentity({ root: paths.parse(root).root }, root, paths)).toThrow('身份不匹配')
})

it('一次保存同时替换真实 pt 与 marker，失败时不写入半成品', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'issue-1144-source-'))
  const file = path.join(dir, 'page.uvue')
  const original = '<template><pt-probe :pt="{ root: \'p-0!\' }" /><view>anchor</view></template>'
  const steps = [1, 2].map(index => ({ markerClass: `w-[${index}px]`, markerText: `save-${index}`, cssContains: [] }))
  try {
    await writeFile(file, original)
    await rewriteHmrMarker(file, ['<view>anchor'], steps, 0, { from: 'p-0!', to: 'p-10!' })
    const first = await readFile(file, 'utf8')
    expect(first).toContain('p-10!')
    expect(first).toContain('save-1')
    await expect(rewriteHmrMarker(file, [], steps, 1, { from: 'missing', to: 'p-4!' })).rejects.toThrow('替换目标')
    expect(await readFile(file, 'utf8')).toBe(first)
    await rewriteHmrMarker(file, [], steps, 1, { from: 'p-10!', to: 'p-4!' })
    const second = await readFile(file, 'utf8')
    expect(second).not.toContain('save-1')
    expect(second).toContain('p-4!')
    expect(second).toContain('save-2')
    expect(second.match(/hbuilderx-web-hmr-probe/g)).toHaveLength(1)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it.each(['none', 'browser', 'server', 'source', 'project'])('清理阶段先断开浏览器，且 %s 失败后仍恢复项目', async (failure) => {
  let serverRunning = true
  let browserOpen = true
  let sourceRestored = false
  let projectClosed = false
  const result = cleanupWebHmrSession({
    closeBrowser: async () => {
      expect(serverRunning).toBe(true)
      browserOpen = false
      if (failure === 'browser') {
        throw new Error(failure)
      }
    },
    stopServer: async () => {
      await Promise.resolve()
      expect(browserOpen).toBe(false)
      serverRunning = false
      if (failure === 'server') {
        throw new Error(failure)
      }
    },
    restoreSource: async () => {
      expect(serverRunning).toBe(false)
      sourceRestored = true
      if (failure === 'source') {
        throw new Error(failure)
      }
    },
    closeProject: async () => {
      expect(sourceRestored).toBe(true)
      projectClosed = true
      if (failure === 'project') {
        throw new Error(failure)
      }
    },
  })
  if (failure === 'none') {
    await expect(result).resolves.toBeUndefined()
  }
  else {
    await expect(result).rejects.toThrow(failure)
  }
  expect(projectClosed).toBe(true)
})

it('Web 多个收尾阶段失败时保留所有异常并继续恢复源码', async () => {
  const browserError = new Error('browser close failed')
  const serverError = new Error('server stop failed')
  const closeError = new Error('project close failed')
  const stages: string[] = []
  const error = await cleanupWebHmrSession({
    closeBrowser: async () => {
      stages.push('browser')
      throw browserError
    },
    stopServer: async () => {
      stages.push('server')
      throw serverError
    },
    restoreSource: async () => { stages.push('source') },
    closeProject: async () => {
      stages.push('project')
      throw closeError
    },
  }).catch(error => error)
  expect(stages).toEqual(['browser', 'server', 'source', 'project'])
  expect(error).toMatchObject({ errors: [browserError, serverError, closeError], cause: browserError })
})
