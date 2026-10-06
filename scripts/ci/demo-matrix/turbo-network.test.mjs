import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { dryRun, runTurbo, withTurboFixture } from './turbo-fixture.mjs'

const proxyKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_USE_ENV_PROXY',
]

function proxyEnvironment(port) {
  return Object.fromEntries(proxyKeys.map(key => [key, key === 'NODE_USE_ENV_PROXY'
    ? '1'
    : key.toLowerCase() === 'no_proxy' ? 'localhost,127.0.0.1,::1' : `http://127.0.0.1:${port}`]))
}

describe('Turbo 网络环境边界', () => {
  it('严格模式向真实构建子进程传递代理配置，仍过滤无关变量', async () => {
    await withTurboFixture([{ name: 'network-environment-fixture' }], async ({ cwd, entries: [item] }) => {
      const keys = [...proxyKeys, 'WEAPP_TEST_UNRELATED_ENV']
      await writeFile(path.join(item.directory, 'build.mjs'), `
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
const { counter } = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'))
const keys = ${JSON.stringify(keys)}
await writeFile(counter, JSON.stringify(Object.fromEntries(keys.map(key => [key, process.env[key] ?? null]))))
`)
      const env = proxyEnvironment(7891)
      await runTurbo(cwd, ['--env-mode=strict'], { ...env, WEAPP_TEST_UNRELATED_ENV: 'must-not-leak' })
      expect(JSON.parse(await readFile(item.counter, 'utf8'))).toEqual({ ...env, WEAPP_TEST_UNRELATED_ENV: null })
    })
  }, 30_000)

  it('代理地址不参与构建产物缓存身份', async () => {
    await withTurboFixture([{ name: 'network-environment-fixture' }], async ({ cwd }) => {
      const initial = await dryRun(cwd, ['--env-mode=strict'], proxyEnvironment(7891))
      const changed = await dryRun(cwd, ['--env-mode=strict'], proxyEnvironment(7892))
      expect(changed.tasks[0].hash).toBe(initial.tasks[0].hash)
    })
  }, 30_000)
})
