import type { Plugin, ResolvedConfig } from 'vite'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { finalizeFrameworkCssEmission, installFrameworkCssEmission } from '@/bundlers/vite/shared/framework-css-emission'

function config(plugin: Plugin, command: 'build' | 'serve' = 'build') {
  return { command, plugins: [plugin] } as ResolvedConfig
}

function handler(hook: any) {
  return typeof hook === 'object' ? hook.handler : hook
}

describe('框架 CSS 资源发射边界', () => {
  it('保留 hook 元数据、返回值、异步与上下文，并在命名之前转换 string/bytes', async () => {
    const context = {
      getFileName: vi.fn((reference: string) => `assets/${reference}.css`),
      emitFile: vi.fn(file => file.name),
      environment: { name: 'client' },
    }
    const css = { type: 'asset', name: 'renamed.css', source: 'before' } as const
    const image = { type: 'asset', name: 'icon.svg', source: '<svg/>' } as const
    const plugin: Plugin = {
      name: 'vite:css-post',
      renderChunk: {
        order: 'post',
        async handler() {
          expect(this.environment).toBe(context.environment)
          const reference = this.emitFile(css)
          this.emitFile(image)
          return { code: this.getFileName(reference) }
        },
      },
      generateBundle: {
        order: 'pre',
        handler() {
          this.emitFile({ type: 'asset', fileName: 'fixed.css', source: Buffer.from('before') })
        },
      },
    }
    expect(installFrameworkCssEmission(config(plugin), source => source.replace('before', 'after'))).toBe(true)
    expect((plugin.renderChunk as any).order).toBe('post')
    expect((plugin.generateBundle as any).order).toBe('pre')
    expect(await handler(plugin.renderChunk).call(context)).toEqual({ code: 'assets/renamed.css.css' })
    handler(plugin.generateBundle).call(context)
    expect(context.emitFile.mock.calls[0]![0]).toEqual({ ...css, source: 'after' })
    expect(context.emitFile.mock.calls[1]![0]).toBe(image)
    expect(context.emitFile.mock.calls[2]![0]).toEqual({ type: 'asset', fileName: 'fixed.css', source: Buffer.from('after') })
    expect(css.source).toBe('before')
  })

  it('重复安装更新本轮转换器，不叠加旧配置且不修改固定文件名', () => {
    const context = { emitFile: vi.fn(file => file.fileName) }
    const plugin: Plugin = {
      name: 'vite:css-post',
      generateBundle() {
        return this.emitFile({ type: 'asset', fileName: 'custom.css', source: 'initial' })
      },
    }
    const first = vi.fn(source => `${source}-old`)
    const next = vi.fn(source => `${source}-new`)
    installFrameworkCssEmission(config(plugin), first)
    installFrameworkCssEmission(config(plugin), next)
    expect(handler(plugin.generateBundle).call(context)).toBe('custom.css')
    expect(first).not.toHaveBeenCalled()
    expect(next.mock.calls[0]?.[0]).toBe('initial')
    expect(context.emitFile).toHaveBeenCalledExactlyOnceWith({ type: 'asset', fileName: 'custom.css', source: 'initial-new' })
  })

  it('只适配实际 CSS producer 的生产输出，保持其它 hook 与文件不变', () => {
    const source = new Uint8Array([1, 2, 3])
    const files = [
      { type: 'asset', name: 'icon.png', source },
      { type: 'asset', name: 'pending.css' },
      { type: 'chunk', id: 'entry.js' },
      { type: 'asset', name: 'unchanged.css', source: 'unchanged' },
    ]
    const context = { emitFile: vi.fn(file => file.name) }
    const plugin: Plugin = {
      name: 'vite:css-post',
      renderChunk() {
        files.forEach(file => this.emitFile(file as any))
      },
    }
    const transform = vi.fn(value => value)
    expect(installFrameworkCssEmission(config(plugin, 'serve'), transform)).toBe(false)
    expect(installFrameworkCssEmission(config({ name: 'other' }), transform)).toBe(false)
    expect(installFrameworkCssEmission(config({ name: 'vite:css-post' }), transform)).toBe(false)
    installFrameworkCssEmission(config(plugin), transform)
    handler(plugin.renderChunk).call(context)
    expect(transform.mock.calls[0]?.[0]).toBe('unchanged')
    files.forEach((file, index) => expect(context.emitFile.mock.calls[index]![0]).toBe(file))
  })

  it('转换失败在资源发射前传播，不留下未修正的资源', () => {
    const context = { emitFile: vi.fn() }
    const plugin: Plugin = {
      name: 'vite:css-post',
      generateBundle() {
        this.emitFile({ type: 'asset', name: 'style.css', source: 'before' })
      },
    }
    installFrameworkCssEmission(config(plugin), () => {
      throw new Error('CSS transform failed')
    })
    expect(() => handler(plugin.generateBundle).call(context)).toThrow('CSS transform failed')
    expect(context.emitFile).not.toHaveBeenCalled()
  })

  it('在最终 bundle 中为匿名框架 CSS 重算身份并同步 HTML 引用', () => {
    let emitted: any
    const context = {
      getFileName: vi.fn(() => 'assets/index-abcdef12.css'),
      emitFile: vi.fn((file: any) => {
        emitted = file
        return 'css-reference'
      }),
    }
    const plugin: Plugin = {
      name: 'vite:css-post',
      generateBundle() {
        this.emitFile({ type: 'asset', name: 'index.css', source: 'before' })
      },
    }
    const resolved = config(plugin)
    installFrameworkCssEmission(resolved, source => `${source}-emitted`)
    handler(plugin.generateBundle).call(context)
    expect(emitted.source).toBe('before-emitted')
    const bundle = {
      'assets/index-abcdef12.css': { type: 'asset', fileName: 'assets/index-abcdef12.css', source: 'before-finalized' },
      'index.html': { type: 'asset', fileName: 'index.html', source: '<link href="assets/index-abcdef12.css">' },
      'entry.js': { type: 'chunk', fileName: 'entry.js', code: 'import("./assets/index-abcdef12.css")' },
    } as any
    finalizeFrameworkCssEmission(resolved, bundle)
    const renamed = Object.keys(bundle).find(file => file.startsWith('assets/index-') && file.endsWith('.css'))
    expect(renamed).toMatch(/^assets\/index-[0-9a-f]{8}\.css$/)
    expect(bundle['index.html'].source).toContain(renamed)
    expect(bundle['entry.js'].code).toContain(renamed)
  })

  it.each([new Set(['assets/index-abcdef12.css']), ['assets/index-abcdef12.css']])('同步框架不同版本的 CSS metadata 容器：%j', (importedCss) => {
    const plugin: Plugin = {
      name: 'vite:css-post',
      generateBundle() {
        this.emitFile({ type: 'asset', name: 'index.css', source: '.probe{color:red}' })
      },
    }
    const resolved = config(plugin)
    installFrameworkCssEmission(resolved, source => source)
    handler(plugin.generateBundle).call({ emitFile: () => 'reference', getFileName: () => 'assets/index-abcdef12.css' })
    const chunk = { type: 'chunk', fileName: 'entry.js', code: '', viteMetadata: { importedCss } }
    const bundle = {
      'entry.js': chunk,
      'assets/index-abcdef12.css': { type: 'asset', fileName: 'assets/index-abcdef12.css', source: '.probe{color:red}' },
      'index.html': { type: 'asset', fileName: 'index.html', source: '<link href="assets/index-abcdef12.css">' },
    } as any
    finalizeFrameworkCssEmission(resolved, bundle)
    const renamed = Object.keys(bundle).find(file => file.endsWith('.css'))!
    expect(renamed).not.toBe('assets/index-abcdef12.css')
    expect([...chunk.viteMetadata.importedCss]).toEqual([renamed])
  })
})
