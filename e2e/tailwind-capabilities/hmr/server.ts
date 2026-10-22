import type { ViteDevServer } from 'vite'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createLogger, createServer } from 'vite'
import { WeappTailwindcssWeb } from 'weapp-tailwindcss/vite/web'
import { digest } from '../identity'
import { hmrCss, hmrIcon, hmrPage, hmrSource, hmrStates } from './fixture'
import { hmrWatchOptions } from './watch'

export async function withHmrServer<T>(root: string, runId: string, logs: string[], run: (server: { url: string, instance: string, source: string }) => Promise<T>) {
  const allocated = await mkdtemp(path.join(tmpdir(), 'tailwind-vite-hmr-'))
  let server: ViteDevServer | undefined
  try {
    const directory = await realpath(allocated)
    const instance = digest({ root: directory, runId })
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const source = path.join(directory, 'probe.js')
    for (const [name, content] of Object.entries({ 'package.json': '{"type":"module"}', 'entry.css': hmrCss, 'probe.js': hmrSource(runId, hmrStates[0]), 'favicon.svg': hmrIcon, 'index.html': hmrPage.replace('__TAILWIND_INSTANCE__', instance) })) {
      await writeFile(path.join(directory, name), content)
    }
    const logger = createLogger('silent')
    logger.error = message => logs.push(`error:${message}`)
    logger.warn = message => logs.push(`warn:${message}`)
    logger.info = message => logs.push(`info:${message}`)
    // 夹具只有原生 JS 和 CSS，不启动无依赖的预打包扫描，避免关闭时留下异步扫描任务。
    server = await createServer({ root: directory, configFile: false, customLogger: logger, clearScreen: false, optimizeDeps: { noDiscovery: true, include: [] }, plugins: WeappTailwindcssWeb({ tailwindcssBasedir: directory, cssEntries: [path.join(directory, 'entry.css')], rem2rpx: false }) ?? [], server: { host: '127.0.0.1', port: 0, open: false, fs: { allow: [directory, root] }, watch: hmrWatchOptions } })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string' || path.resolve(server.config.root) !== path.resolve(directory)) {
      throw new Error('HMR 服务没有绑定本轮独立工作目录或端口')
    }
    return await run({ source, instance, url: `http://127.0.0.1:${address.port}/` })
  }
  finally {
    try {
      await server?.close()
    }
    finally {
      await rm(allocated, { recursive: true, force: true })
    }
  }
}
