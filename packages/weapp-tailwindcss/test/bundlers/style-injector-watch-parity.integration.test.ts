import type { RollupWatcher } from 'rollup'
import { rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { createInjectorWatchObserver, createInjectorWatchProject, injectorWatchConfig } from './fixtures/injector-watch-project'

async function closeWatchProject(root: string, watchers: RollupWatcher[]) {
  const closed = await Promise.allSettled(watchers.map(watcher => watcher.close()))
  await rm(root, { recursive: true, force: true })
  const errors = closed.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length > 0) {
    throw new AggregateError(errors, '真实 injector watch 清理失败')
  }
}

describe('内置与独立 Uni injector 的真实 Vite watch 对照', () => {
  it('同项目交错构建时，组件样式连续更新与来源删除产生相同 CSS/JS 资产', async () => {
    const root = await createInjectorWatchProject()
    const watchers: RollupWatcher[] = []
    const observers = [createInjectorWatchObserver('内置'), createInjectorWatchObserver('独立')]
    try {
      // 两个构建实例共享配置值与项目文件，但分别创建插件和编译会话。
      for (const [index, builtin] of [true, false].entries()) {
        const observer = observers[index]!
        const result = await build(injectorWatchConfig(root, builtin, observer.plugin))
        if (Array.isArray(result) || 'output' in result) {
          throw new Error('预期真实 Rollup watcher，实际取得单次构建产物')
        }
        watchers.push(result)
        observer.attach(result)
      }
      const variants = [
        { selector: '.first', color: 'red', width: 7 },
        { selector: '.second', color: 'blue', width: 11 },
        { selector: '.third', color: 'green', width: 13 },
      ]
      for (const [index, variant] of variants.entries()) {
        if (index > 0) {
          await writeFile(path.join(root, 'feature', 'index.css'), `${variant.selector} { color: ${variant.color}; }`)
          await writeFile(path.join(root, 'feature', 'components', 'card.css'), `.card { width: ${variant.width}rpx; }`)
        }
        const verify = (outputs: Record<string, string>) => {
          expect(outputs['feature/index.acss']).toContain(variant.selector)
          expect(outputs['feature/index.acss']).toContain(variant.color)
          expect(outputs['feature/components/card.acss']).toContain(`width: ${variant.width}rpx`)
          expect(outputs['feature/components/card.acss']).toContain('../index.acss')
          expect(outputs['entry.js']).toContain('w-_b17px_B')
          for (const previous of variants.slice(0, index)) {
            expect(outputs['feature/index.acss']).not.toContain(previous.selector)
          }
        }
        const [builtin, standalone] = await Promise.all(observers.map(observer => observer.waitFor(index + 1, verify)))
        expect(builtin).toEqual(standalone)
      }

      await unlink(path.join(root, 'feature', 'index.css'))
      const [builtin, standalone] = await Promise.all(observers.map(observer => observer.waitFor(4, (outputs) => {
        expect(outputs['feature/index.acss']).toBeUndefined()
        expect(outputs['feature/components/card.acss']).toContain('width: 13rpx')
        expect(Object.values(outputs).join('\n')).not.toContain('.third')
      })))
      expect(builtin).toEqual(standalone)
    }
    finally {
      await closeWatchProject(root, watchers)
    }
  }, 60_000)
})
