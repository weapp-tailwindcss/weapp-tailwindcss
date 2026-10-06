import type { FSWatcher, WatchListener } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { watchInput } from '../src/metro/watch'

it('同一文件连续原子保存后仍能读取新内容，监听可显式释放', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-watch-'))
  const file = path.join(root, 'style.css')
  fs.writeFileSync(file, 'initial')
  let latest = ''
  const watcher = watchInput(file, () => {
    latest = fs.readFileSync(file, 'utf8')
  })
  try {
    for (const content of ['first', 'second']) {
      const temporary = path.join(root, 'save.tmp')
      fs.writeFileSync(temporary, content)
      fs.renameSync(temporary, file)
      await vi.waitFor(() => expect(latest).toBe(content))
    }
  }
  finally {
    watcher.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
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
