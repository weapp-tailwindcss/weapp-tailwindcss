import type { NativePairEvidence, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { androidPairCoordinates } from './react-native/android-window'
import { captureNativePair, validateNativeArtifacts } from './react-native/pair-evidence'
import { createSemanticReporter } from './react-native/semantic-reporter'

function input(): NativePairEvidence {
  return {
    runId: 'run',
    platform: 'web',
    revision: 'baseline',
    id: 'background-color',
    phase: 'default',
    probe: { x: 0, y: 0, width: 40, height: 40 },
    reference: { x: 50, y: 0, width: 40, height: 40 },
    control: { x: 0, y: 50, width: 40, height: 40 },
    target: { x: 10, y: 10, width: 20, height: 20 },
    referenceTarget: { x: 60, y: 10, width: 20, height: 20 },
    controlTarget: { x: 10, y: 60, width: 20, height: 20 },
    viewport: { width: 100, height: 100, pixelRatio: 1 },
  }
}

function pixels() {
  const image = new PNG({ width: 100, height: 100 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const left of [10, 60]) {
    for (let y = 10; y < 30; y++) {
      for (let x = left; x < left + 20; x++) {
        image.data.set([18, 52, 86, 255], (y * image.width + x) * 4)
      }
    }
  }
  return PNG.sync.write(image)
}

describe('原生宿主截图证据', () => {
  it('重读截图和坐标，拒绝被替换的字节与跨阶段 sidecar', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-artifact-'))
    try {
      const pair = input()
      const receipt = await captureNativePair(pair, { runId: pair.runId, artifacts: directory, capture: async (name) => {
        const file = path.join(directory, name)
        await fs.writeFile(file, pixels())
        return file
      } })
      const report = { runId: pair.runId, revision: pair.revision, receipts: [receipt] } as unknown as ReactNativeReport
      await expect(validateNativeArtifacts(report, directory)).resolves.toBeUndefined()
      const file = path.join(directory, receipt.artifact.name)
      const saved = await fs.readFile(`${file}.json`, 'utf8')
      await fs.writeFile(`${file}.json`, saved.replace('"revision": "baseline"', '"revision": "old"'))
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/stale/)
      await fs.writeFile(`${file}.json`, saved)
      await fs.appendFile(file, 'changed')
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow(/modified/)
      await fs.rm(file)
      await expect(validateNativeArtifacts(report, directory)).rejects.toThrow()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('用实际 Android 节点校准 inset，旧标签和裁剪不能复用', () => {
    const pair = input()
    const xml = '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-probe" content-desc="background-color:default" bounds="[0,24][40,64]" />'
      + '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-reference" content-desc="background-color:default" bounds="[50,24][90,64]" />'
      + '<node package="com.weapptailwindcss.rncompat" resource-id="tw-rn-case-control" content-desc="background-color:default" bounds="[0,74][40,114]" />'
    expect(androidPairCoordinates(xml, pair)).toMatchObject({ probe: { y: 24 }, target: { y: 34 }, referenceTarget: { y: 34 }, control: { y: 74 }, controlTarget: { y: 84 } })
    expect(() => androidPairCoordinates(xml.replaceAll(':default', ':old'), pair)).toThrow(/Missing current/)
    expect(() => androidPairCoordinates(xml.replace('[0,24][40,64]', '[0,24][40,60]'), pair)).toThrow(/Clipped/)
  })

  it('宿主只接受本轮已知用例并校验回执归属', async () => {
    const pair = input()
    const receipt = { runId: pair.runId, id: pair.id, phase: pair.phase, checkpoints: [], artifact: { name: 'test.png', sha256: 'a'.repeat(64), byteLength: 100 } }
    const capture = vi.fn(async () => receipt)
    const reporter = createSemanticReporter({ runId: pair.runId, fixtureHash: 'fixture', catalogHash: 'catalog', versions: {} }, capture)
    const server = createServer((request, response) => {
      if (!reporter.handle(request, response)) {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Missing test reporter address')
      }
      const endpoint = `http://127.0.0.1:${address.port}`
      expect(await (await fetch(`${endpoint}/context`)).json()).toMatchObject({ runId: pair.runId })
      const accepted = await fetch(`${endpoint}/case`, { method: 'POST', body: JSON.stringify(pair) })
      expect(accepted.ok).toBe(true)
      const report = { runId: pair.runId, revision: pair.revision, receipts: [receipt] } as unknown as ReactNativeReport
      expect(() => reporter.assertReceipts(report)).not.toThrow()
      expect(() => reporter.assertReceipts({ ...report, receipts: [{ ...receipt, phase: 'old' }] })).toThrow(/Missing host/)
      const stale = await fetch(`${endpoint}/case`, { method: 'POST', body: JSON.stringify({ ...pair, runId: 'old' }) })
      expect(stale.status).toBe(500)
      expect(capture).toHaveBeenCalledOnce()
      expect(() => reporter.assertReady()).toThrow(/semantic evidence failed/)
    }
    finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
