import type { Plugin, ViteDevServer } from 'vite'
import type { SourceFramework, SourceRevision } from './fixtures'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createLogger, createServer } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'
import { digest } from '../identity'
import { frameworkSource } from './fixtures'
import { frameworkSourceResources } from './resources'

export interface FrameworkSourceServer {
  url: string
  instance: string
  source: string
  updateSource: (revision: SourceRevision) => Promise<string>
  server: ViteDevServer
}

export async function frameworkDependencies(root: string, framework: SourceFramework) {
  const consumer = createRequire(path.join(root, 'demo', framework === 'react' ? 'taro-vite-react-tailwindcss-v4' : 'taro-vite-vue3-tailwindcss-v4', 'package.json'))
  const runtime = ['runtime', 'merge', 'cva', 'variants'].map(name => ({ find: new RegExp(`^@weapp-tailwindcss/${name}$`), replacement: path.join(root, 'packages-runtime', name, 'src', 'index.ts') }))
  const aliases = [...runtime, { find: /^@weapp-tailwindcss\/escape$/, replacement: path.join(root, 'packages', 'escape', 'src', 'index.ts') }]
  if (framework === 'react') {
    return { aliases: [...aliases, { find: /^react$/, replacement: consumer.resolve('react') }, { find: /^react-dom\/client$/, replacement: consumer.resolve('react-dom/client') }], plugins: [] as Plugin[] }
  }
  const loaded = await import(pathToFileURL(consumer.resolve('@vitejs/plugin-vue')).href)
  const vue = loaded.default as (options?: unknown) => Plugin
  return { aliases: [...aliases, { find: /^vue$/, replacement: consumer.resolve('vue/dist/vue.runtime.esm-bundler.js') }], plugins: [vue()] }
}

/** 复用现有框架依赖和产品插件；扫描入口只指向本次实际执行的源码文件。 */
export async function withFrameworkSourceServer<T>(root: string, runId: string, framework: SourceFramework, logs: string[], run: (server: FrameworkSourceServer) => Promise<T>) {
  // macOS 的临时路径可经 /var 符号链接访问，Vite root 与 fs.allow 必须使用同一真实目录身份。
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), `tailwind-framework-${framework}-`)))
  let server: ViteDevServer | undefined
  try {
    const instance = digest({ root: directory, runId, framework })
    const dependencies = await frameworkDependencies(root, framework)
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const sourceName = `Probe.${framework === 'react' ? 'tsx' : 'vue'}`
    const source = path.join(directory, sourceName)
    for (const [name, content] of Object.entries(frameworkSourceResources(framework, runId, instance))) {
      await writeFile(path.join(directory, name), content)
    }
    const logger = createLogger('silent')
    logger.error = message => logs.push(`error:${message}`)
    logger.warn = message => logs.push(`warn:${message}`)
    logger.info = message => logs.push(`info:${message}`)
    let pending: { observed: boolean, complete: () => void } | undefined
    const synchronization: Plugin = {
      name: 'framework-source-save-barrier',
      hotUpdate: {
        order: 'post',
        handler(context) {
          if (path.resolve(context.file) === source && pending) {
            pending.observed = true
          }
        },
      },
    }
    server = await createServer({ root: directory, cacheDir: path.join(directory, '.vite'), configFile: false, customLogger: logger, clearScreen: false, resolve: { alias: dependencies.aliases }, esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' }, plugins: [...dependencies.plugins, ...(WeappTailwindcssWeb({ tailwindcssBasedir: directory, cssEntries: [path.join(directory, 'entry.css')], rem2rpx: false }) ?? []), synchronization], server: { host: '127.0.0.1', port: 0, open: false, fs: { allow: [directory, root] }, watch: { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 } }, async hotUpdateEnvironments(active, update) {
      // 原始 watcher 事件早于异步插件和模块图失效；保存完成必须等待整个 Vite 更新周期。
      await Promise.all(Object.values(active.environments).map(environment => update(environment)))
      if (pending?.observed) {
        pending.complete()
      }
    } } })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string' || path.resolve(server.config.root) !== path.resolve(directory)) {
      throw new Error('框架服务没有绑定本轮隔离工作目录和端口')
    }
    const activeServer = server
    const updateSource = async (revision: SourceRevision) => {
      if (pending) {
        throw new Error('框架源码保存必须串行执行')
      }
      const content = frameworkSource(framework, revision, runId)
      let timer: ReturnType<typeof setTimeout> | undefined
      const change = new Promise<void>((resolve, reject) => {
        pending = { observed: false, complete: resolve }
        timer = setTimeout(() => reject(new Error(`框架源码保存未完成 Vite 更新周期：${revision}`)), 15_000)
      })
      try {
        await writeFile(source, content)
        await change
      }
      finally {
        pending = undefined
        clearTimeout(timer)
      }
      return content
    }
    return await run({ source, instance, server: activeServer, url: `http://127.0.0.1:${address.port}/`, updateSource })
  }
  finally {
    try {
      await server?.close()
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
