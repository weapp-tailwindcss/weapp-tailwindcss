import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { withHmrServer } from './tailwind-capabilities/hmr/server'
import { hmrWatchOptions } from './tailwind-capabilities/hmr/watch'

it('Vite 的源码身份与真实临时目录一致，软链根目录不阻断模块或 CSS 加载', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const logs: string[] = []
  await withHmrServer(root, 'canonical-directory-test', logs, async ({ source, url, instance }) => {
    expect(path.dirname(source)).toBe(await realpath(path.dirname(source)))
    const [html, module, css] = await Promise.all([
      fetch(url),
      fetch(new URL('probe.js', url)),
      fetch(new URL('entry.css', url)),
    ])
    expect(html.status).toBe(200)
    expect(await html.text()).toContain(instance)
    expect(module.status).toBe(200)
    expect(await module.text()).toContain('canonical-directory-test/initial')
    expect(css.status).toBe(200)
    expect(await css.text()).toContain('80px')
  })
  expect(logs.filter(message => message.startsWith('error:'))).toEqual([])
}, 120_000)

it('连续保存的最终删除在 Node 监听器去重窗口内仍可观察', async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'tailwind-hmr-watch-')))
  const source = path.join(directory, 'probe.txt')
  await writeFile(source, 'initial')
  const server = await createServer({
    root: directory,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: { ...hmrWatchOptions, useFsEvents: false, usePolling: false } },
  })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const watcher = server.watcher
    await vi.waitFor(() => expect(watcher.getWatched()[path.dirname(source)]).toContain(path.basename(source)), { interval: 10 })
    const stages: string[] = []
    const complete = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`最终保存事件丢失：${stages.join(',')}`)), 2000)
      watcher.on('change', (file) => {
        if (path.resolve(file) !== source) {
          return
        }
        const content = readFileSync(source, 'utf8')
        if (stages.length === 0 && content === 'replaced') {
          stages.push('replaced')
          // 紧接一次真实保存，复现 Vite Node 监听器 50ms 去重窗口中的最后写入。
          writeFileSync(source, 'deleted')
        }
        else if (stages.length === 1 && content === 'deleted') {
          stages.push('deleted')
          resolve()
        }
      })
    })
    await writeFile(source, 'replaced')
    await complete
    expect(stages).toEqual(['replaced', 'deleted'])
    expect(await readFile(source, 'utf8')).toBe('deleted')
  }
  finally {
    clearTimeout(timeout)
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)
