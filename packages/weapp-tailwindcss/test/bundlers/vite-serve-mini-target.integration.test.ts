import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'

it('keeps served mini-target CSS and newly added JS classes in sync', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.tmp-vite-serve-mini-'))
  const sourceFile = path.join(root, 'main.ts')
  const source = (classes: string) => `import './main.css'; export const cls = '${classes}'; export const business = 'keep-[business]';`
  await writeFile(path.join(root, 'index.html'), '<script type="module" src="/main.ts"></script>')
  await writeFile(path.join(root, 'main.css'), '@import "tailwindcss";\n@source "./main.ts";')
  await writeFile(sourceFile, source('h-8 h-[64rpx] bg-emerald-50/80'))
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: WeappTailwindcss({ generator: { target: 'weapp' } }),
    server: { host: '127.0.0.1', port: 0, watch: { usePolling: true, interval: 30 } },
  })
  try {
    await server.listen()
    const url = server.resolvedUrls!.local[0]!
    const read = async (file: string) => (await fetch(new URL(file, url))).text()
    expect(await read('main.ts')).toContain('h-_b64rpx_B')
    const css = await read('main.css?direct')
    expect(css).toContain('.h-_b64rpx_B')
    expect(css).toContain('.bg-emerald-50_f80')
    expect(css).toContain('height: 64rpx')

    await writeFile(sourceFile, source('h-12 h-[64rpx] bg-emerald-50/80 w-[137rpx]'))
    await expect.poll(async () => read('main.ts'), { timeout: 10_000 }).toContain('w-_b137rpx_B')
    await expect.poll(async () => read('main.css?direct'), { timeout: 10_000 }).toContain('.w-_b137rpx_B')
    expect(await read('main.ts')).toContain('keep-[business]')
    expect(await read('main.ts')).not.toContain('keep-_b')
  }
  finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
