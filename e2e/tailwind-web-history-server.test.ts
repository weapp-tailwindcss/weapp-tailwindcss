import { expect, it } from 'vitest'
import { historyPaths, historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { historyServer } from './tailwind-capabilities/web-history/server'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

it('独占HTTP只响应本轮精确路径并保存真实请求，finally定向关闭', async () => {
  const raw = syntheticHistory().raw
  raw.requests = []
  raw.cleanup.serverClosed = false
  let sequence = 0
  const server = await historyServer('.generated{}', raw.runId, raw, () => ++sequence)
  const paths = historyPaths(raw.runId)
  try {
    const fixture = await fetch(raw.origin + paths.fixture)
    expect(fixture.status).toBe(200)
    expect(await fixture.text()).toContain(historyProbe.candidate)
    expect((await fetch(raw.origin + paths.target)).status).toBe(200)
    expect((await fetch(raw.origin + paths.control)).status).toBe(404)
    expect((await fetch(`${raw.origin}/other-run/fixture`)).status).toBe(404)
    expect((await fetch(raw.origin + paths.fixture, { method: 'POST' })).status).toBe(404)
    expect(raw.requests.map(request => [request.path, request.method, request.status, request.sequence])).toEqual([
      [paths.fixture, 'GET', 200, 1],
      [paths.target, 'GET', 200, 2],
      [paths.control, 'GET', 404, 3],
      ['/other-run/fixture', 'GET', 404, 4],
      [paths.fixture, 'POST', 404, 5],
    ])
  }
  finally { await server.close() }
  expect(raw.cleanup.serverClosed).toBe(true)
  await expect(fetch(raw.origin + paths.fixture)).rejects.toThrow()
})
