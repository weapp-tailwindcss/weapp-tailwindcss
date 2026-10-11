import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { hasHarmonyDomMarker, injectHarmonyDomProbe, observeHarmonyDomProbe, readHarmonyDomProbe } from './hbuilderx-local/harmony-dom-probe'
import { captureNativeLog } from './hbuilderx-local/native-log'

function payload(text = 'current-marker') {
  return {
    runId: 'current-run',
    pixelRatio: 3.5,
    marker: { id: 'native-hmr-probe', tagName: 'VIEW', text, rect: { left: 0, top: 64, width: 173, height: 41 } },
    nodes: [],
  }
}

const line = (value: unknown, runId = 'current-run') => `[LOG] WT_HARMONY_DOM_${runId}=${JSON.stringify(value)} at pages/index/index.uvue:10`

describe('Harmony Vapor runtime DOM evidence', () => {
  it('uses the latest real marker in the same run and preserves layout data', () => {
    const report = readHarmonyDomProbe(`${line(payload('old-marker'))}\r\n${line(payload())}`, 'current-run')
    expect(report).toEqual(payload())
    expect(hasHarmonyDomMarker(report, 'current-marker')).toBe(true)
    expect(hasHarmonyDomMarker(report, 'old-marker')).toBe(false)
  })

  it('rejects old runs even when their marker matches', () => {
    expect(readHarmonyDomProbe(line(payload(), 'previous-run'), 'current-run')).toBeUndefined()
    expect(readHarmonyDomProbe(line({ ...payload(), runId: 'previous-run' }), 'current-run')).toBeUndefined()
    expect(hasHarmonyDomMarker(undefined, 'current-marker')).toBe(false)
  })

  it('waits for layout instead of accepting an unpainted marker', () => {
    const value = payload()
    value.marker.rect.height = 0
    expect(hasHarmonyDomMarker(readHarmonyDomProbe(line(value), 'current-run'), 'current-marker')).toBe(false)
  })

  it('fails on malformed geometry and runtime API errors', () => {
    const value = payload()
    value.marker.rect.width = Number.NaN
    expect(() => readHarmonyDomProbe(line(value), 'current-run')).toThrow('不完整')
    expect(() => readHarmonyDomProbe(line({ runId: 'current-run', error: 'API unavailable' }), 'current-run')).toThrow('API unavailable')
  })

  it('installs a real element query with cleanup without changing the template or existing setup', () => {
    const source = '<script setup lang="uts">const original = 1</script>\n<template><view>original</view></template>'
    const result = injectHarmonyDomProbe(source, 'current-run')
    expect(result).toContain('uni.getElementById(\'native-hmr-probe\')')
    expect(result).toContain('(element as UniTextElement).value')
    expect(result).toContain('getBoundingClientRect()')
    expect(result).toContain('clearInterval(__wtDomProbeTimer)')
    expect(result).toContain('const original = 1</script>\n<template><view>original</view></template>')
    expect(() => injectHarmonyDomProbe('<template/>', 'current-run')).toThrow('script setup')
  })

  it('retains a fragmented runtime message after unrelated system log flooding', () => {
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const observer = observeHarmonyDomProbe({ stdout, stderr }, 'current-run')
    const message = line(payload())
    stdout.write(message.slice(0, 45))
    stderr.write('unrelated error log\n')
    stdout.write(`${message.slice(45)}\r\n`)
    for (let index = 0; index < 200; index++) {
      stdout.write(`system log ${index}\n`)
    }
    expect(observer.read()).toEqual(payload())
    stdout.write(`${line(payload('updated-marker'))}\n`)
    expect(hasHarmonyDomMarker(observer.read(), 'updated-marker')).toBe(true)
    observer.dispose()
    stdout.end()
    stderr.end()
  })

  it('persists the complete launch log even after more than the summary buffer limit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harmony-native-log-'))
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const file = path.join(root, 'hbuilderx.log')
    const log = captureNativeLog({ stdout, stderr }, file)
    try {
      stdout.write('Vapor mode\nApp Launch\n')
      for (let index = 0; index < 200; index++) {
        stdout.write(`system log ${index}\n`)
      }
      stderr.write('last diagnostic\n')
      await log.close()
      const text = await fs.readFile(file, 'utf8')
      expect(text).toContain('Vapor mode\nApp Launch\n')
      expect(text).toContain('system log 199\nlast diagnostic\n')
    }
    finally {
      stdout.end()
      stderr.end()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
