import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { withGenerationModuleCache } from '@/v4/module-cache'

// 原生 ESM 的依赖缓存协议需要绕过 Vitest 的模块执行器验证。
const { createTailwindGenerationSession, resolveTailwindV4Source } = createRequire(import.meta.url)('../dist/index.cjs') as typeof import('../src')

describe('生成模块缓存', () => {
  it('并发生成全部结束后停用异步上下文，并在失败后释放', async () => {
    const disable = vi.spyOn(AsyncLocalStorage.prototype, 'disable')
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-module-context-'))
    const file = path.join(root, 'config.cjs')
    const hooks = globalThis as typeof globalThis & { __tw_load?: (url: string) => unknown }
    const previous = hooks.__tw_load
    const loader = { loadModule: vi.fn(async () => ({ module: { marker: true } })) }
    let resume!: () => void
    const pending = new Promise<void>((resolve) => { resume = resolve })
    try {
      await fs.writeFile(file, 'module.exports = { marker: true }')
      const second = withGenerationModuleCache(loader, async () => {
        await pending
        return hooks.__tw_load?.(pathToFileURL(file).href)
      }, [file])
      await withGenerationModuleCache(loader, async () => undefined)
      expect(disable).not.toHaveBeenCalled()
      resume()
      expect(await second).toEqual({ default: { marker: true } })
      expect(disable).toHaveBeenCalledTimes(1)
      await expect(withGenerationModuleCache(loader, async () => {
        throw new Error('generation failed')
      })).rejects.toThrow('generation failed')
      expect(disable).toHaveBeenCalledTimes(2)
    }
    finally {
      resume()
      disable.mockRestore()
      if (previous) hooks.__tw_load = previous
      else delete hooks.__tw_load
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it.each([
    { extension: 'cjs', commonJs: true, extensionless: false },
    { extension: 'mjs', commonJs: false, extensionless: false },
    { extension: 'ts', commonJs: false, extensionless: false },
    { extension: 'js', commonJs: true, extensionless: true },
    { extension: 'js', commonJs: false, extensionless: false },
    { extension: 'ts', commonJs: false, extensionless: true },
    { extension: 'js', commonJs: true, extensionless: false, manifest: false },
  ])('复用配置并刷新间接依赖：$extension / CJS=$commonJs / 省略扩展名=$extensionless / manifest=$manifest', async ({ extension, commonJs, extensionless, manifest = true }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-module-cache-'))
    const config = path.join(root, `tailwind.config.${extension}`)
    const helper = path.join(root, `color.${extension}`)
    const key = `module-cache:${root}`
    const globals = globalThis as typeof globalThis & Record<string, unknown>
    const prefix = commonJs ? 'module.exports =' : 'export default'
    try {
      if (manifest) {
        await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: commonJs ? 'commonjs' : 'module' }))
      }
      await fs.writeFile(helper, `${prefix} '#112233'`)
      await fs.writeFile(config, [
        commonJs ? `const color = require('./color.${extension}')` : `import color from './color.${extension}'`,
        `globalThis[${JSON.stringify(key)}] = (globalThis[${JSON.stringify(key)}] || 0) + 1`,
        `${prefix} { theme: { extend: { colors: { brand: color } } } }`,
      ].join('\n'))
      const source = await resolveTailwindV4Source({
        projectRoot: path.resolve(import.meta.dirname, '..'),
        base: root,
        css: `@import "tailwindcss"; @config "${(extensionless ? path.join(root, 'tailwind.config') : config).replaceAll('\\', '/')}";`,
      })
      const generate = async () => {
        const session = createTailwindGenerationSession(source)
        try {
          return (await session.generate({ candidates: ['bg-brand'] })).fragments[0]!.root.toString()
        }
        finally {
          session.dispose()
        }
      }
      expect(await generate()).toContain('#112233')
      expect(await generate()).toContain('#112233')
      expect(globals[key]).toBe(1)

      const stat = await fs.stat(helper)
      await fs.writeFile(helper, `${prefix} '#445566'`)
      await fs.utimes(helper, stat.atime, stat.mtime)
      expect(await generate()).toContain('#445566')
      expect(await generate()).toContain('#445566')
      expect(globals[key]).toBe(2)

      const session = createTailwindGenerationSession(source)
      try {
        await session.generate({ candidates: ['bg-brand'] })
        session.invalidate({ type: 'dependencies', paths: [config] })
        await session.generate({ candidates: ['bg-brand'] })
        expect(globals[key]).toBe(3)
      }
      finally {
        session.dispose()
      }
    }
    finally {
      delete globals[key]
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('并发入口刷新共享 CJS 对象，删除和恢复不能回退到 ESM 包装中的旧值', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'generation-shared-cjs-')))
    const helper = path.join(root, 'colors.cjs')
    const sources: Awaited<ReturnType<typeof resolveTailwindV4Source>>[] = []
    try {
      await fs.writeFile(helper, 'module.exports = { brand: "#123456" }')
      for (const name of ['first', 'second']) {
        await fs.writeFile(path.join(root, `${name}.cjs`), 'module.exports = { theme: { colors: require("./colors.cjs") } }')
        sources.push(await resolveTailwindV4Source({
          projectRoot: path.resolve(import.meta.dirname, '..'),
          base: root,
          css: `@config "./${name}.cjs"; @tailwind utilities;`,
        }))
      }
      const generate = async () => Promise.all(sources.map(async (source) => {
        const session = createTailwindGenerationSession(source)
        try {
          return (await session.generate({ candidates: ['bg-brand'] })).fragments[0]!.root.toString()
        }
        finally { session.dispose() }
      }))
      expect((await generate()).every(css => css.includes('#123456'))).toBe(true)
      await fs.writeFile(helper, 'module.exports = { brand: "#654321" }')
      expect((await generate()).every(css => css.includes('#654321') && !css.includes('#123456'))).toBe(true)
      await fs.rm(helper)
      // 等待所有失败请求结束，再恢复依赖，避免测试本身制造文件恢复竞态。
      const failed = await Promise.allSettled(sources.map(async (source) => {
        const session = createTailwindGenerationSession(source)
        try { return await session.generate({ candidates: ['bg-brand'] }) }
        finally { session.dispose() }
      }))
      expect(failed.map(result => result.status)).toEqual(['rejected', 'rejected'])
      await fs.writeFile(helper, 'module.exports = { brand: "#123456" }')
      expect((await generate()).every(css => css.includes('#123456'))).toBe(true)
    }
    finally { await fs.rm(root, { recursive: true, force: true }) }
  })

  it('保留已有模块 hook，且不接管引擎调用之外的请求', async () => {
    const hooks = globalThis as typeof globalThis & { __tw_load?: (url: string) => unknown }
    const previous = hooks.__tw_load
    const value = { default: { marker: true } }
    hooks.__tw_load = url => url === 'virtual:config' ? value : undefined
    const loader = { loadModule: vi.fn() }
    try {
      await withGenerationModuleCache(loader, async () => {
        expect(await hooks.__tw_load?.('virtual:config')).toBe(value)
      })
      const url = pathToFileURL(path.join(os.tmpdir(), 'outside-config.cjs'))
      url.searchParams.set('id', 'outside')
      expect(await hooks.__tw_load?.(url.href)).toBeUndefined()
      expect(loader.loadModule).not.toHaveBeenCalled()
    }
    finally {
      if (previous) hooks.__tw_load = previous
      else delete hooks.__tw_load
    }
  })
})
