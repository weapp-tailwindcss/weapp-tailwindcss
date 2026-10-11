import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { prepareIsolated } from '../prepare-process.mjs'

it('准备进程退出后释放真实原生扩展，保留嵌套 Map、源码与各平台路径', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-prepare-'))
  const worker = path.join(directory, 'worker.mjs')
  try {
    await writeFile(worker, `
      import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
      import { createRequire } from 'node:module'
      import path from 'node:path'
      import { serialize } from 'node:v8'
      const request = JSON.parse(readFileSync(process.argv[2], 'utf8'))
      const require = createRequire(request.item.lightningcss)
      require(request.item.lightningcss)
      const native = Object.keys(require.cache).find(file => file.endsWith('.node') && file.includes('lightningcss'))
      const copy = path.join(request.directory, 'consumer-native.node')
      copyFileSync(native, copy)
      const css = require(copy).transform({ filename: 'style.css', code: Buffer.from('.a{color:red}') }).code.toString()
      const steps = new Map(request.item.sources)
      writeFileSync(request.response, serialize({ pid: process.pid, css, steps: { static: new Map([['initial', steps]]) } }))
      process.on('exit', () => writeFileSync(request.response + '.exited', 'done'))
    `)
    const sources = [['src/page.vue', '<style>.a{color:red}</style>'], ['C:\\consumer\\src\\app.css', '.b{}'], ['D:\\app.css', '.c{}'], ['/src/app.css', '.d{}']]
    const lightningcss = createRequire(import.meta.url).resolve('lightningcss')
    const result = await prepareIsolated({ sources, lightningcss }, {}, directory, path.join(directory, 'logs'), { worker: pathToFileURL(worker) })
    expect(result.pid).not.toBe(process.pid)
    expect(() => process.kill(result.pid, 0)).toThrow()
    expect(await readFile(path.join(directory, 'prepare-response.bin.exited'), 'utf8')).toBe('done')
    expect([...result.steps.static.get('initial')]).toEqual(sources)
    expect(result.css).toContain('color: red')
    await rm(path.join(directory, 'consumer-native.node'))
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('准备失败不会消费遗留响应，并保留子进程日志', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-prepare-'))
  try {
    const worker = path.join(directory, 'worker.mjs')
    await writeFile(worker, 'throw new Error("准备失败证据")')
    await writeFile(path.join(directory, 'prepare-response.bin'), 'stale')
    await expect(prepareIsolated({}, {}, directory, path.join(directory, 'logs'), { worker: pathToFileURL(worker) })).rejects.toThrow('准备失败证据')
    expect(await readFile(path.join(directory, 'logs', 'prepare-process.log'), 'utf8')).toContain('准备失败证据')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
