import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { expect, it, vi } from 'vitest'
import { captureMiniProgramViewport } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'
import { validateCapabilityReport, verifyReportArtifacts } from './tailwind-capabilities/report'
import { captureWeappProbe } from './tailwind-capabilities/weapp/capture'
import { weappProbes } from './tailwind-capabilities/weapp/fixtures'
import { weappReplayFixture } from './tailwind-capabilities/weapp/test-fixture'

vi.mock('../scripts/demo-visual-e2e-report/mini-program-screenshot', async original => ({
  ...await original<typeof import('../scripts/demo-visual-e2e-report/mini-program-screenshot')>(),
  captureMiniProgramViewport: vi.fn(async (_mini: unknown, file: string) => PNG.sync.read(await readFile(file))),
}))

it.each([false, true])('采集通过页面动作接口推进阶段，失败时也保留原始测量：错误标记=%s', async (wrongMarker) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'weapp-capture-protocol-'))
  try {
    const probe = weappProbes.find(probe => probe.id === 'runtime-color-weight-limit')!
    const { report, sidecar, contract } = await weappReplayFixture(directory, probe)
    const shared = report.results[0]!.artifacts.filter(file => file === 'generated.wxss' || file.startsWith(`project${path.sep}`))
    report.artifacts = report.artifacts.filter(item => shared.includes(item.path))
    report.results = []
    await rm(path.join(directory, `${probe.id}.json`))
    if (wrongMarker) {
      await writeFile(path.join(directory, `${probe.id}-after.png`), await readFile(path.join(directory, `${probe.id}-before.png`)))
    }
    let index = -1
    let input: unknown
    const events: string[] = []
    const tap = vi.fn(async () => {
      index++
      input = sidecar.phases[index]!.input
      events.push(`tap/${index}`)
    })
    const page = {
      setData: vi.fn(async (data: { state: unknown }) => {
        index = 0
        input = data.state
      }),
      waitFor: vi.fn(async () => {}),
      data: vi.fn(async () => {
        events.push(`data/${index}`)
        return { state: input, phaseIndex: index }
      }),
      $: vi.fn(async (selector: string) => {
        if (selector === '#toggle') {
          return { tap }
        }
        const phase = sidecar.phases[index]!
        const name = selector === '#probe' ? 'probe' : selector === '#reference' ? 'reference' : selector === '#composite-foreground' ? 'foreground' : selector === '#composite-background' ? 'background' : selector === '#composite-gray' ? 'gray' : 'marker'
        return {
          text: async () => phase.identityText,
          style: async (property: string) => {
            events.push(`style/${index}/${selector}/${property}`)
            return (selector === '#probe' ? phase.actual : selector === '#reference' ? phase.reference : phase.witness)[property]
          },
          offset: async () => ({ left: phase.rectangles[name]!.left, top: phase.rectangles[name]!.top }),
          size: async () => ({ width: phase.rectangles[name]!.width, height: phase.rectangles[name]!.height }),
        }
      }),
    }
    const context = { directory, root: directory, runId: report.runId }
    const capture = captureWeappProbe(context, report, {} as Parameters<typeof captureWeappProbe>[2], page as unknown as Parameters<typeof captureWeappProbe>[3], probe, sidecar.cssHash)
    if (wrongMarker) {
      await expect(capture).rejects.toThrow('标记')
      const partial = JSON.parse(await readFile(path.join(directory, `${probe.id}.json`), 'utf8'))
      expect(partial.phases.map((phase: { name: string }) => phase.name)).toEqual(['before', 'after'])
      expect(report.artifacts.some(item => item.path === `${probe.id}.json`)).toBe(true)
      expect(tap).toHaveBeenCalledOnce()
      return
    }
    const captured = await capture
    report.results.push({ id: probe.id, status: 'passed', support: 'unsupported', reason: contract.expectation.reason!, assertions: captured.assertions, artifacts: [...shared, ...captured.artifacts], warnings: [] })
    expect(tap).toHaveBeenCalledTimes(2)
    expect(page.setData).toHaveBeenCalledOnce()
    expect(events.filter(event => event.startsWith('data/'))).toEqual(['data/0', 'data/1', 'data/2'])
    for (const phase of ['before', 'after', 'restored']) {
      expect(vi.mocked(captureMiniProgramViewport).mock.calls.map(call => path.basename(call[1]))).toContain(`${probe.id}-${phase}.png`)
    }
    expect(captured.artifacts).toHaveLength(10)
    validateCapabilityReport(report, [contract], report.identity, report.runId, 'weapp')
    await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
