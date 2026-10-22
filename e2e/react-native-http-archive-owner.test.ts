import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createMetroHttpArchive, identity, setup, validateMetroHttpArchive, withMetroHttpArchive } from './react-native/http-archive-test-fixture'
import { prepareMetroHttpObservation } from './react-native/http-observation'

it('原件初始化失败不改变真实bundle响应，观察收尾明确失败', async () => {
  const test = await setup((_request, response) => response.end('still-served'))
  await writeFile(path.join(test.directory, 'request-1.json'), 'occupied')
  expect(await (await fetch(`${test.url}/index.bundle`)).text()).toBe('still-served')
  expect(test.inner).toHaveBeenCalledOnce()
  await expect(test.drain()).rejects.toThrow(/写入失败/)
})

it('写盘队列超限仍原样发送，不将截断观察登记完整', async () => {
  const test = await setup((_request, response) => response.end('larger-than-one-byte'), false, { maxPendingBytes: 1 })
  expect(await (await fetch(`${test.url}/index.bundle`)).text()).toBe('larger-than-one-byte')
  await expect(test.drain()).rejects.toThrow(/写入失败/)
  await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow(/回执/)
})

it('本轮记录数超限不影响后续HTTP，归档必须失败', async () => {
  const test = await setup((_request, response) => response.end('served'), false, { maxRecords: 1 })
  for (let index = 0; index < 2; index++) {
    expect(await (await fetch(`${test.url}/index.bundle?request=${index}`)).text()).toBe('served')
  }
  await expect(test.drain()).rejects.toThrow(/写入失败/)
})

it('停止接受与最终结算分列，关闭后新请求不冒记为已观察', async () => {
  const test = await setup((_request, response) => response.end('served'))
  await (await fetch(`${test.url}/index.bundle?first`)).text()
  const before = await test.drain()
  await (await fetch(`${test.url}/index.bundle?after-drain`)).text()
  const after = await test.drain()
  expect(after).toEqual(before)
  expect(after.records).toHaveLength(1)
  expect(Date.parse(after.stoppedAcceptingAt)).toBeLessThanOrEqual(Date.parse(after.closedAt))
})

it('独占目录拒绝二次初始化，不覆盖第一轮原件', async () => {
  const test = await setup((_request, response) => response.end('original'))
  await (await fetch(`${test.url}/index.bundle`)).text()
  const before = await test.drain()
  expect(() => createMetroHttpArchive({ directory: test.directory, identity, token: 'different' })).toThrow()
  expect(await validateMetroHttpArchive(test.directory, identity)).toEqual(before)
})

it('增强保留原Metro server、原enhancer、handler与调用this', async () => {
  const test = await setup((_request, response) => response.end())
  const inner = vi.fn()
  const previous = vi.fn(() => inner)
  const config = { server: { other: true, enhanceMiddleware: previous } }
  const observed = withMetroHttpArchive(config, { RN_METRO_HTTP_ARCHIVE: JSON.stringify({ directory: path.join(test.root, 'second'), identity, token: 'owner' }) })
  const metro = vi.fn()
  const server = {}
  const handler = observed.server.enhanceMiddleware(metro, server)
  const owner = {}
  const request = { url: '/status' }
  const response = {}
  const next = vi.fn()
  handler.call(owner, request, response, next)
  expect(previous).toHaveBeenCalledExactlyOnceWith(metro, server)
  expect(previous.mock.instances[0]).toBe(config.server)
  expect(inner).toHaveBeenCalledExactlyOnceWith(request, response, next)
  expect(inner.mock.instances[0]).toBe(owner)
  expect(observed.server.other).toBe(true)
  expect(withMetroHttpArchive(config, {})).toBe(config)
})

it.each(['status', 'method', 'url', 'headers', 'body-path'])('同步伪造%s两份回执也不能通过结构合同', async (field) => {
  const test = await setup((_request, response) => response.end('original'))
  await (await fetch(`${test.url}/index.bundle`)).text()
  const index = await test.drain()
  const record = index.records[0]
  if (field === 'status') {
    record.response.status = 'anything'
  }
  if (field === 'method') {
    record.request.method = 'DELETE'
  }
  if (field === 'url') {
    record.request.rawUrl = '/status'
  }
  if (field === 'headers') {
    record.response.headers = []
  }
  if (field === 'body-path') {
    record.body.file = 'C:relative.bin'
  }
  await writeFile(path.join(test.directory, 'request-1.json'), JSON.stringify(record))
  await writeFile(path.join(test.directory, 'index.json'), JSON.stringify(index))
  await expect(validateMetroHttpArchive(test.directory, identity)).rejects.toThrow(/回执|元数据/)
  expect((await readFile(path.join(test.directory, 'body-1.bin'))).toString()).toBe('original')
})

it('元数据从Expo实际依赖链解析Metro，不取仓库其他版本', async () => {
  const test = await setup((_request, response) => response.end())
  await writeFile(path.join(test.root, 'runtime-session.json'), JSON.stringify(identity))
  const observation = await prepareMetroHttpObservation(path.resolve(import.meta.dirname, '..'), test.root, { compiler: 'test' })
  const options = JSON.parse(observation.environment.RN_METRO_HTTP_ARCHIVE)
  expect(options.identity.tools.metro.version).toBe('0.83.3')
  expect(options.identity.tools['@expo/cli'].version).toBe('54.0.27')
  expect(options.identity.metroConfigSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(options.identity.observer).toHaveLength(2)
  expect(options.identity.invocationId).toBe(identity.invocationId)
})
