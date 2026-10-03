import path from 'node:path'
import process from 'node:process'
import { expect, it } from 'vitest'
import { runOwnedWorker } from '../../../../scripts/e2e-preflight/process'
import { fixture } from './fixture'

it('真实 CLI、代理和 pnpm 子进程逐层终止并等待关闭', async () => {
  const f = await fixture()
  const proxyModule = new URL('../../../../scripts/pnpm-smart-proxy.mjs', import.meta.url).href
  const runnerModule = new URL('../../../../scripts/update-packages.ts', import.meta.url).href
  await f.write('pnpm.mjs', 'import fs from "node:fs"; fs.writeFileSync("leaf.pid", String(process.pid)); setInterval(() => {}, 1000)')
  await f.write('proxy.mjs', `
    import { spawn } from 'node:child_process'
    import { main } from ${JSON.stringify(proxyModule)}
    await main({
      argv: ['--help'],
      canConnectImpl: async () => false,
      spawnImpl: () => spawn(process.execPath, ['pnpm.mjs'], { stdio: 'inherit' }),
    })
  `)
  await f.write('runner.mjs', `
    import { existsSync } from 'node:fs'
    import { setTimeout } from 'node:timers/promises'
    import { runProxy } from ${JSON.stringify(runnerModule)}
    const result = runProxy([], process.cwd(), 'proxy.mjs')
    while (!existsSync('leaf.pid')) { await setTimeout(10) }
    process.emit('SIGTERM')
    console.log('CLOSED:' + JSON.stringify(await result))
  `)
  const output = await runOwnedWorker({
    command: process.execPath,
    args: ['--import', import.meta.resolve('tsx'), path.join(f.root, 'runner.mjs')],
    cwd: f.root,
    timeoutMs: 15_000,
  })
  const leafPid = Number(await f.read('leaf.pid'))
  expect(output).toContain('CLOSED:')
  expect(leafPid).toBeGreaterThan(1)
  expect(() => process.kill(leafPid, 0)).toThrow()
})
