import type { FSWatcher, WatchListener } from 'node:fs'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { watchInput } from '../src/metro/watch'

it('同一文件连续原子保存后仍能读取新内容，监听可显式释放', async ({ onTestFailed, onTestFinished }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-watch-'))
  const file = path.join(root, 'style.css')
  fs.writeFileSync(file, 'initial')
  const startedAt = Date.now()
  const observations: object[] = []
  let pending = ''
  let changed: ((content: string) => void) | undefined
  const watcher = watchInput(file, () => {
    const content = fs.readFileSync(file, 'utf8')
    observations.push({ callback: content, at: Date.now() - startedAt })
    changed?.(content)
  })
  watcher.on('change', (event, filename) => {
    observations.push({ event, filename, at: Date.now() - startedAt })
  })
  onTestFailed(() => {
    console.error('Metro 原子保存事件记录', { pending, observations })
  })
  // 测试总超时也要释放监听，再清理其父目录。
  onTestFinished(async () => {
    changed = undefined
    const closed = once(watcher, 'close')
    watcher.close()
    await closed
    fs.rmSync(root, { recursive: true, force: true })
  })
  for (const content of ['first', 'second']) {
    pending = content
    // 直接等待原生事件，异步集成边界由项目 testTimeout 统一约束。
    const nextChange = new Promise<string>((resolve) => {
      changed = resolve
    })
    const temporary = path.join(root, 'save.tmp')
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, file)
    observations.push({ saved: content, at: Date.now() - startedAt })
    expect(await nextChange).toBe(content)
  }
  pending = ''
})

it('父目录监听过滤相邻文件，未知文件名事件仍核对当前输入', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-watch-filter-'))
  const file = path.join(root, 'style.css')
  fs.writeFileSync(file, 'initial')
  let changed!: WatchListener<string>
  const close = vi.fn()
  const watch = vi.spyOn(fs, 'watch').mockImplementation(((_target: string, _options: unknown, callback: WatchListener<string>) => {
    changed = callback
    return { close } as unknown as FSWatcher
  }) as typeof fs.watch)
  const notify = vi.fn()
  const watcher = watchInput(file, notify)
  try {
    expect(watch).toHaveBeenCalledWith(root, { persistent: false, recursive: false }, expect.any(Function))
    changed('rename', 'other.css')
    expect(notify).not.toHaveBeenCalled()
    changed('rename', 'style.css')
    changed('change', null)
    expect(notify).toHaveBeenCalledTimes(2)
  }
  finally {
    watcher.close()
    expect(close).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
