import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { build, createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import * as tailwindRuntime from '@/tailwindcss/runtime'
import { WeappTailwindcssWeb } from '@/vite-web'

describe('vite/web CSS-only 真实构建', () => {
  const cssUpdateTimeoutMs = 60_000

  async function getAvailablePort() {
    const probe = createNetServer()
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', resolve)
    })
    const address = probe.address()
    if (!address || typeof address === 'string') {
      await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
      throw new Error('无法获取临时测试端口')
    }
    const port = address.port
    await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()))
    return port
  }

  async function waitForCss(url: string, predicate: (css: string) => boolean, label: string) {
    const deadline = Date.now() + cssUpdateTimeoutMs
    while (Date.now() < deadline) {
      const css = await fetch(url).then(response => response.text())
      if (predicate(css)) {
        return css
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`等待 CSS 更新超时：${label} ${url}`)
  }

  async function buildFixture(plugins: ReturnType<typeof WeappTailwindcssWeb>) {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp-vite-web-css-only-'))
    try {
      await writeFile(path.join(root, 'index.html'), '<script type="module" src="/main.ts"></script><div class="text-red-500 bg-slate-100">hello</div>')
      await writeFile(path.join(root, 'main.css'), '@import "tailwindcss";\n@source "./index.html";')
      await writeFile(path.join(root, 'main.ts'), 'import "./main.css"; console.log("text-blue-500")')

      await build({
        root,
        configFile: false,
        plugins,
        build: {
          cssMinify: false,
          sourcemap: true,
        },
      })

      const outputDir = path.join(root, 'dist')
      const assetsDir = path.join(outputDir, 'assets')
      const files = await readdir(assetsDir)
      const cssFile = files.find(file => file.endsWith('.css'))
      const jsFile = files.find(file => file.endsWith('.js'))
      expect(cssFile).toBeDefined()
      expect(jsFile).toBeDefined()
      const css = await readFile(path.join(assetsDir, cssFile!), 'utf8')
      const js = await readFile(path.join(assetsDir, jsFile!), 'utf8')
      expect(css).toContain('.text-red-500')
      expect(css).toContain('.bg-slate-100')
      expect(js).toContain('text-blue-500')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  it('专用入口生成 Web CSS，但不改写 HTML/JavaScript', async () => {
    await buildFixture(WeappTailwindcssWeb())
  }, 120_000)

  it('主入口自动识别 Generic Web 后复用 CSS-only profile', async () => {
    await buildFixture(WeappTailwindcss())
  }, 120_000)

  it('CSS-only 构建只消费源码候选，不额外生成项目级运行时类集合', async () => {
    const collect = vi.spyOn(tailwindRuntime, 'collectRuntimeClassSet')
    try {
      await buildFixture(WeappTailwindcssWeb())
      expect(collect).not.toHaveBeenCalled()
    }
    finally {
      collect.mockRestore()
    }
  }, 120_000)

  it('专用入口在候选源码变化后重新生成 CSS', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.tmp-vite-web-css-only-hmr-'))
    const sourceFile = path.join(root, 'main.ts')
    const initialSource = 'import "./main.css"; console.log("text-red-500")'
    const updatedSource = 'import "./main.css"; console.log("text-emerald-400")'
    await writeFile(path.join(root, 'index.html'), '<script type="module" src="/main.ts"></script>')
    await writeFile(path.join(root, 'main.css'), '@import "tailwindcss";\n@source "./main.ts";')
    await writeFile(sourceFile, initialSource)

    const port = await getAvailablePort()
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: WeappTailwindcssWeb(),
      server: { host: '127.0.0.1', port, strictPort: true },
    })
    try {
      await server.listen()
      const address = server.httpServer?.address() as AddressInfo
      const cssUrl = `http://127.0.0.1:${address.port}/main.css`
      const initialCss = await waitForCss(cssUrl, css => css.includes('.text-red-500'), 'initial')
      expect(initialCss).not.toContain('.text-emerald-400')

      const updateSource = async (source: string) => {
        await writeFile(sourceFile, source)
        server.watcher.emit('change', sourceFile)
      }

      await updateSource(updatedSource)
      await waitForCss(cssUrl, css => css.includes('.text-emerald-400') && !css.includes('.text-red-500'), 'updated')

      await updateSource('import "./main.css"; console.log("候选已删除")')
      await waitForCss(cssUrl, css => !css.includes('.text-emerald-400') && !css.includes('.text-red-500'), 'removed')
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
