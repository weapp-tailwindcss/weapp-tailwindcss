import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { openBrowser } from './browser.mjs'
import { repo } from './catalog.mjs'

it.each([
  { vueHydration: false },
  { vueHydration: true },
  { vueHydration: true, replacementStatus: 200 },
  { vueHydration: true, replacementStatus: 404 },
])('SSR hydration 就绪与文档切换边界：%j', async ({ vueHydration, replacementStatus }) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'demo-hydration-')))
  const requireDemo = createRequire(path.join(repo, 'demo/uni-app-vite-tailwindcss-v4/package.json'))
  await writeFile(path.join(root, 'entry.js'), `
    import { createSSRApp, h, onMounted } from 'vue'
    createSSRApp({ setup() {
      onMounted(() => console.log('hydration-complete'))
      return () => h('div', { id: 'tw-matrix-height' }, 'ready')
    } }).mount('#app')
  `)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { vue: requireDemo.resolve('vue/dist/vue.esm-bundler.js') } },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, repo] } },
    plugins: [{
      name: 'controlled-hydration',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/replacement') {
            res.statusCode = replacementStatus
            res.setHeader('Content-Type', 'text/html')
            res.end('<div id="tw-matrix-height">replacement</div>')
            return
          }
          if (req.url !== '/') {
            return next()
          }
          res.setHeader('Content-Type', 'text/html')
          res.end(`<script type="module" src="/@vite/client"></script>
            <script type="module">globalThis.releaseHydration = () => import('/entry.js')</script>
            <div id="app"><div id="tw-matrix-height">ready</div></div>`)
        })
      },
    }],
  })
  const hydrationObserved = Promise.withResolvers()
  const launch = chromium.launch.bind(chromium)
  let page
  let switched = false
  // 只观察真实 DOM 检查；水合由独立门控触发，不依赖计时或模拟 Vue 状态。
  const intercepted = vi.spyOn(chromium, 'launch').mockImplementation(async (...args) => {
    const browser = await launch(...args)
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...args) => {
      page = await newPage(...args)
      const locator = page.locator.bind(page)
      page.locator = (...args) => {
        const target = locator(...args)
        const evaluate = target.evaluate.bind(target)
        target.evaluate = async (...args) => {
          const result = await evaluate(...args)
          hydrationObserved.resolve(result)
          if (result === true && replacementStatus !== undefined && !switched) {
            // 真实挂载检查返回前更换文档，旧组件结果不能放行新文档。
            switched = true
            const response = await page.goto(new URL('/replacement', page.url()).href, { waitUntil: 'load' })
            expect(response.status()).toBe(replacementStatus)
          }
          return result
        }
        return target
      }
      return page
    }
    return browser
  })
  let browser
  let opening
  const deadline = Date.now() + 20_000
  try {
    await server.listen()
    opening = openBrowser(server.resolvedUrls.local[0], {
      ensureRunning() {
        if (switched) {
          throw new Error('新文档必须重新完成就绪检查')
        }
        expect(Date.now()).toBeLessThan(deadline)
      },
    }, root, { vueHydration }).then((opened) => {
      browser = opened
      return opened
    })
    if (vueHydration) {
      const first = await Promise.race([
        opening.then(() => 'returned'),
        hydrationObserved.promise.then(mounted => ({ mounted })),
      ])
      expect(first).toEqual({ mounted: false })
      expect(browser).toBeUndefined()
      if (replacementStatus === undefined) {
        await page.evaluate(() => globalThis.releaseHydration())
        const opened = await opening
        expect(opened.events).toContain('log: hydration-complete')
      }
      else {
        const rejected = expect(opening).rejects.toThrow('新文档必须重新完成就绪检查')
        await page.evaluate(() => globalThis.releaseHydration())
        await rejected
        expect(switched).toBe(true)
        expect(browser).toBeUndefined()
      }
    }
    else {
      const opened = await opening
      expect(opened.events).not.toContain('log: hydration-complete')
      expect(await page.locator('#tw-matrix-height').evaluate(element => element.__vueParentComponent?.isMounted === true)).toBe(false)
    }
  }
  finally {
    intercepted.mockRestore()
    // 失败路径也释放门控并收回本测试创建的浏览器，避免遗留悬挂的打开操作。
    await page?.evaluate(() => globalThis.releaseHydration?.()).catch(() => {})
    await opening?.catch(() => {})
    await browser?.close()
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
