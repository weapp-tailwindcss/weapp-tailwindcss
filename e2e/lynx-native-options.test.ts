import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { iosPodInstallArguments, parseNativeRunArgs, stageNativeRunContext } from './lynx/native-options'

const workspace = path.resolve('workspace')

describe('native Lynx runner options', () => {
  it('avoids refreshing the full CocoaPods Specs CDN by default', () => {
    expect(iosPodInstallArguments(false)).toEqual(['install'])
    expect(iosPodInstallArguments(true)).toEqual(['install', '--repo-update'])
  })

  it('preserves the compatibility-report defaults', () => {
    expect(parseNativeRunArgs(['android'], workspace)).toEqual({
      platform: 'android',
      captureOnly: false,
      captureScroll: false,
      bundlePath: undefined,
      outputDir: undefined,
      captureDurationSeconds: 15,
    })
  })

  it('resolves an explicit capture bundle and output directory', () => {
    expect(parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'dist/main.lynx.bundle', '--output', '.capture/ios', '--duration', '12'], workspace)).toEqual({
      platform: 'ios',
      captureOnly: true,
      captureScroll: false,
      bundlePath: path.join(workspace, 'dist', 'main.lynx.bundle'),
      outputDir: path.join(workspace, '.capture', 'ios'),
      captureDurationSeconds: 12,
    })
  })

  it('rejects capture-only mode without a bundle', () => {
    expect(() => parseNativeRunArgs(['android', '--capture-only'])).toThrow('--capture-only requires --bundle')
  })

  it('enables native scroll only for an explicit iOS capture', () => {
    expect(parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'demo.bundle', '--scroll'], workspace)).toMatchObject({ captureScroll: true })
    expect(() => parseNativeRunArgs(['ios', '--scroll'])).toThrow('--scroll requires ios --capture-only')
    expect(() => parseNativeRunArgs(['android', '--capture-only', '--bundle', 'demo.bundle', '--scroll'])).toThrow('--scroll requires ios --capture-only')
  })

  it('requires enough recording time to observe both native offsets', () => {
    expect(() => parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'demo.bundle', '--scroll', '--duration', '7'])).toThrow('at least 8 seconds')
    expect(parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'demo.bundle', '--scroll', '--duration', '8']).captureDurationSeconds).toBe(8)
  })

  it('stages duration only for an explicitly requested native scroll recording', () => {
    const context = { version: 1, runId: 'current' }
    const options = parseNativeRunArgs(['ios', '--capture-only', '--bundle', 'demo.bundle', '--scroll', '--duration', '18'])
    expect(stageNativeRunContext(context, options)).toEqual({ ...context, captureScroll: true, captureDurationSeconds: 18 })
    expect(stageNativeRunContext(context, { ...options, captureScroll: false })).toBe(context)
  })
})
