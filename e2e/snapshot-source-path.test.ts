import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { relativeGeneratedCssSource } from './snapshot/source-path'

describe.each(['linux', 'darwin', 'win32'])('%s 宿主上的 CSS 来源路径边界', (platform) => {
  it.each([
    ['/workspace/app', '/workspace/app/src/app.css', 'src/app.css'],
    ['/', '/src/app.css', 'src/app.css'],
    ['C:\\', 'C:\\src\\app.css', 'src/app.css'],
    ['C:\\workspace\\app', 'c:/workspace/app/src/app.css', 'src/app.css'],
    ['\\\\server\\share\\app', '\\\\server\\share\\app\\src\\app.css', 'src/app.css'],
    ['relative/app', 'relative/app/src/app.css', 'src/app.css'],
    ['/workspace/app', '/workspace/app-other/src/app.css', undefined],
    ['C:\\app', 'D:\\app\\src\\app.css', undefined],
    ['C:\\', '/src/app.css', undefined],
    ['/', 'C:\\src\\app.css', undefined],
  ])('%s → %s', (root, file, expected) => {
    const actualPlatform = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: platform })
      expect(relativeGeneratedCssSource(root, file)).toBe(expected)
    }
    finally {
      Object.defineProperty(process, 'platform', { value: actualPlatform })
    }
  })
})
