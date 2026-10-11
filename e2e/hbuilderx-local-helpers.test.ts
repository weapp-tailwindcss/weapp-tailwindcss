import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'pathe'
import { hasScreenshotContentChanged, parseHexColorFromClass, shouldRestoreAndroidRuntime } from './hbuilderx-local/android-runtime'
import { appendHmrSourceMutation, createHmrOutputSnapshot, createHmrSourceRestore, haveHmrOutputsChanged } from './hbuilderx-local/source-mutations'
import { collectMiniProgramStyleFiles } from './hbuilderx-local/styles'

describe('HBuilderX local helpers', () => {
  it('waits for Android HMR screenshots to differ from the previous frame', () => {
    expect(hasScreenshotContentChanged(Uint8Array.from([1, 2, 3]))).toBe(true)
    expect(hasScreenshotContentChanged(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 2, 3]))).toBe(false)
    expect(hasScreenshotContentChanged(Uint8Array.from([1, 2, 4]), Uint8Array.from([1, 2, 3]))).toBe(true)
    expect(hasScreenshotContentChanged(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(true)
  })

  it('parses arbitrary Tailwind background colors for Android screenshot evidence', () => {
    expect(parseHexColorFromClass('flex bg-[#102938] text-white')).toEqual({
      blue: 56,
      green: 41,
      red: 16,
    })
    expect(parseHexColorFromClass('bg-red-500')).toBeUndefined()
  })

  it('only restores a live UniApp runtime hidden by the HBuilderX debug shell', () => {
    const debugShell = '<node resource-id="io.dcloud.uniappx:id/pull_msg" text="Connect to HBuilderX successfully" />'

    expect(shouldRestoreAndroidRuntime(debugShell, '1234')).toBe(true)
    expect(shouldRestoreAndroidRuntime(debugShell, '1234 5678')).toBe(true)
    expect(shouldRestoreAndroidRuntime(debugShell, '')).toBe(false)
    expect(shouldRestoreAndroidRuntime(debugShell, 'adb: process not found')).toBe(false)
    expect(shouldRestoreAndroidRuntime('<node text="issue-1021-runtime" />', '1234')).toBe(false)
  })

  it('restores files after appending HBuilderX HMR source mutations', async () => {
    const root = await fs.mkdtemp(path.resolve(os.tmpdir(), 'hbuilderx-source-mutation-'))
    const file = path.resolve(root, 'theme.css')
    try {
      await fs.writeFile(file, '@import "tailwindcss";\n')
      const restore = await createHmrSourceRestore([file, file])

      await appendHmrSourceMutation(root, {
        append: '@theme { --color-issue-1021: #123456; }',
        file: 'theme.css',
      })

      expect(await fs.readFile(file, 'utf8')).toBe('@import "tailwindcss";\n@theme { --color-issue-1021: #123456; }\n')
      await restore()
      expect(await fs.readFile(file, 'utf8')).toBe('@import "tailwindcss";\n')

      await appendHmrSourceMutation(root, {
        file: 'theme.css',
        replace: {
          from: '@import "tailwindcss";',
          to: '@import "./main.css";',
        },
      })
      expect(await fs.readFile(file, 'utf8')).toBe('@import "./main.css";\n')

      await appendHmrSourceMutation(root, {
        file: 'theme.css',
        replace: {
          from: '@import "tailwindcss";',
          to: '@import "./main.css";',
        },
      })
      expect(await fs.readFile(file, 'utf8')).toBe('@import "./main.css";\n')
    }
    finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('detects when every HBuilderX transformed output has refreshed', async () => {
    const root = await fs.mkdtemp(path.resolve(os.tmpdir(), 'hbuilderx-output-refresh-'))
    const files = [path.resolve(root, 'app.ts'), path.resolve(root, 'page.ts')]
    try {
      await Promise.all(files.map(file => fs.writeFile(file, 'initial')))
      const snapshot = await createHmrOutputSnapshot(files)
      const refreshedTime = new Date(Date.now() + 2000)

      expect(await haveHmrOutputsChanged(snapshot)).toBe(false)
      await fs.utimes(files[0]!, refreshedTime, refreshedTime)
      expect(await haveHmrOutputsChanged(snapshot)).toBe(false)
      await fs.utimes(files[1]!, refreshedTime, refreshedTime)
      expect(await haveHmrOutputsChanged(snapshot)).toBe(true)
    }
    finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })

  it('collects platform style files recursively without assuming output filenames', async () => {
    const root = await fs.mkdtemp(path.resolve(os.tmpdir(), 'hbuilderx-styles-'))
    try {
      await fs.mkdir(path.resolve(root, 'sub-normal/pages'), { recursive: true })
      await fs.mkdir(path.resolve(root, 'sub-independent/pages'), { recursive: true })
      await Promise.all([
        fs.writeFile(path.resolve(root, 'app.css'), '.app {}'),
        fs.writeFile(path.resolve(root, 'sub-normal/pages/index.css'), '.normal {}'),
        fs.writeFile(path.resolve(root, 'sub-independent/pages/index.css'), '.independent {}'),
        fs.writeFile(path.resolve(root, 'sub-normal/pages/index.js'), 'export {}'),
      ])

      const files = await collectMiniProgramStyleFiles(root, ['.css'])
      expect(files.map(file => path.relative(root, file))).toEqual([
        'app.css',
        'sub-independent/pages/index.css',
        'sub-normal/pages/index.css',
      ])
    }
    finally {
      await fs.rm(root, { force: true, recursive: true })
    }
  })
})
