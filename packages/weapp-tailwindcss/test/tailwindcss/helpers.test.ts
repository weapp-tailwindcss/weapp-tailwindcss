import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPackageInfoMock = vi.fn()
const loggerWarnMock = vi.fn()
const loggerErrorMock = vi.fn()

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger: {
    warn: loggerWarnMock,
    success: vi.fn(),
    info: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
  },
  pc: new Proxy(() => '', {
    apply() {
      return ''
    },
    get() {
      return () => ''
    },
  }),
}))

vi.mock('local-pkg', () => ({
  getPackageInfoSync: getPackageInfoMock,
}))

describe('tailwindcss helpers', () => {
  beforeEach(() => {
    getPackageInfoMock.mockReset()
    loggerWarnMock.mockClear()
    loggerErrorMock.mockClear()
    vi.resetModules()
  })

  it('returns undefined when tailwind package is missing', async () => {
    getPackageInfoMock.mockReturnValueOnce(undefined)

    const { getTailwindcssPackageInfo } = await import('@/tailwindcss')

    expect(getTailwindcssPackageInfo()).toBeUndefined()
    expect(getPackageInfoMock).toHaveBeenCalledWith('tailwindcss', undefined)
  })

  it('forwards resolving options to local-pkg', async () => {
    const pkg = {
      name: 'tailwindcss',
      version: '3.4.0',
      rootPath: '/tmp/tailwindcss',
      packageJsonPath: '/tmp/tailwindcss/package.json',
      packageJson: { name: 'tailwindcss' },
    }
    getPackageInfoMock.mockReturnValueOnce(pkg)

    const { getTailwindcssPackageInfo } = await import('@/tailwindcss')

    const result = getTailwindcssPackageInfo({ paths: ['/repo'] })

    expect(result).toBe(pkg)
    expect(getPackageInfoMock).toHaveBeenCalledWith('tailwindcss', { paths: ['/repo'] })
  })

  it('creates tailwindcss runtime with resolved cache directory', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      basedir: '/repo',
      cacheDir: 'cache',
      supportCustomLengthUnits: false,
    }) as any

    const callArgs = runtime.options as any
    expect(callArgs.cache).toMatchObject({ dir: path.resolve('/repo', 'cache') })
    expect(callArgs.cache?.driver).toBe('memory')
    expect(callArgs.apply?.extendLengthUnits).toBe(false)
    // 源码使用 path.resolve(basedir) 得到平台原生路径
    expect(callArgs.projectRoot).toBe(path.resolve('/repo'))
    expect(Array.isArray(callArgs.tailwindcss?.resolve?.paths)).toBe(true)
  })

  it('honours absolute cache directories', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      cacheDir: '/global/cache',
    })

    const callArgs = runtime.options as any
    expect(callArgs.cache).toEqual({ dir: '/global/cache', driver: 'memory', enabled: true })
  })

  it('enables extendLengthUnits patch by default', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime()

    const callArgs = runtime.options as any
    expect(callArgs.apply?.extendLengthUnits).toEqual({ enabled: true })
  })

  it('falls back to cwd when basedir is not provided', async () => {
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/workspace')
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({ cacheDir: '.cache' })

    const callArgs = runtime.options as any
    expect(callArgs.cache).toEqual({ dir: path.resolve('/workspace', '.cache'), driver: 'memory', enabled: true })
    cwdSpy.mockRestore()
  })

  it('defaults cache directory to package root node_modules cache', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')
    const repoRoot = path.resolve(__dirname, '../../../..')
    const basedir = path.join(repoRoot, 'packages', 'weapp-tailwindcss', 'src')

    const runtime = createTailwindcssRuntime({ basedir })

    const callArgs = runtime.options as any
    expect(callArgs.cache?.dir).toBe(
      path.join(repoRoot, 'packages', 'weapp-tailwindcss', 'node_modules', '.cache', '@tailwindcss-mangle', 'engine'),
    )
  })

  it('creates inert metadata when tailwindcss package is missing', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      tailwindcss: {
        packageName: 'missing-tailwindcss',
      },
    })

    expect(loggerWarnMock).not.toHaveBeenCalled()
    expect(runtime.packageInfo.version).toBeUndefined()
    expect(runtime.packageInfo.name).toBe('missing-tailwindcss')
    expect(runtime.majorVersion).toBe(4)
    expect(runtime.getClassSet).toBeDefined()
    expect(runtime.extract).toBeDefined()
  })

  it('resolves tailwindcss postcss plugin from basedir node_modules', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')
    const repoRoot = path.resolve(__dirname, '../../../..')

    const runtime = createTailwindcssRuntime({
      basedir: repoRoot,
    })

    const callArgs = runtime.options as any
    expect(callArgs.tailwindcss?.postcssPlugin).toBeDefined()
    expect(typeof callArgs.tailwindcss?.postcssPlugin).toBe('string')
    expect(path.isAbsolute(callArgs.tailwindcss?.postcssPlugin)).toBe(true)
  })

  it('uses tailwindcss package as postcss plugin when packageName points to v4 package without explicit version', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      basedir: '/repo',
      tailwindcss: {
        packageName: '@tailwindcss/postcss',
      },
    })

    const callArgs = runtime.options as any
    const postcssPlugin = String(callArgs.tailwindcss?.postcssPlugin).replaceAll('\\', '/')
    expect(postcssPlugin).toContain('/tailwindcss/')
    expect(postcssPlugin).not.toContain('@tailwindcss/postcss')
  })

  it('resolves postcss plugin strings after runtime options merge', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      basedir: path.resolve(__dirname, '../../../..'),
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          postcssPlugin: 'tailwindcss',
        },
      },
    })

    const callArgs = runtime.options as any
    expect(path.isAbsolute(callArgs.tailwindcss?.postcssPlugin)).toBe(true)
  })

  it('keeps custom resolve paths while appending default lookup paths', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')
    const repoRoot = path.resolve(__dirname, '../../../..')
    const appRoot = path.join(repoRoot, 'templates', 'demo')
    const customNodeModules = path.join(appRoot, 'node_modules')

    const runtime = createTailwindcssRuntime({
      basedir: appRoot,
      tailwindcss: {
        packageName: '@tailwindcss/postcss',
        resolve: {
          paths: [customNodeModules],
        },
      },
    })

    const callArgs = runtime.options as any
    const resolvePaths = callArgs.tailwindcss?.resolve?.paths ?? []
    expect(resolvePaths[0]).toBe(customNodeModules)
    expect(resolvePaths).toContain(path.join(repoRoot, 'node_modules'))
    const postcssPlugin = String(callArgs.tailwindcss?.postcssPlugin).replaceAll('\\', '/')
    expect(postcssPlugin).toContain('/tailwindcss/')
    expect(postcssPlugin).not.toContain('@tailwindcss/postcss')
  })

  it('uses Tailwind v4 defaults without creating a fallback config when project has none', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wtw-tailwind-no-config-'))
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    try {
      const runtime = createTailwindcssRuntime({
        basedir: tempDir,
      })
      const callArgs = runtime.options as any
      expect(callArgs.tailwindcss?.config).toBeUndefined()
      expect(callArgs.tailwind?.v4?.css).toBeUndefined()
    }
    finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('filters Tailwind v4 raw source tokens before exposing runtime class set', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wtw-tailwind-v4-runtime-'))
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    try {
      const cssEntry = path.join(tempDir, 'app.css')
      await writeFile(cssEntry, '@import "tailwindcss" source(none); @source "./index.tsx";')
      await writeFile(path.join(tempDir, 'excluded.tsx'), '<View className="z-[7654321]" />')
      await writeFile(path.join(tempDir, 'index.tsx'), [
        'export const view = (',
        '  <View',
        '    className="text-[55rpx] text-[#fff] bg-purple-300"',
        '    data-url="https://example.com/a[b]?q=Hello world!"',
        '  >',
        '    Hello world!',
        '  </View>',
        ')',
      ].join('\n'))

      const runtime = createTailwindcssRuntime({
        basedir: tempDir,
        tailwindcss: {
          resolve: {
            paths: [path.resolve(__dirname, '../../../../node_modules')],
          },
          v4: {
            cssEntries: [cssEntry],
          },
        },
      })

      const report = await runtime.collectContentTokens!()
      expect(report.filesScanned).toBe(1)
      expect(new Set(report.entries.map(entry => entry.file))).toEqual(new Set([await realpath(path.join(tempDir, 'index.tsx'))]))
      const classSet = await runtime.getClassSet()
      const { collectRuntimeClassSet } = await import('@/tailwindcss/runtime')
      const collectedClassSet = await collectRuntimeClassSet(runtime, {
        force: true,
        skipRefresh: true,
      })

      const expected = new Set(['text-[55rpx]', 'text-[#fff]', 'bg-purple-300'])
      expect(classSet).toEqual(expected)
      expect(collectedClassSet).toEqual(expected)
    }
    finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }, 120_000)

  it('sets cwd from discovered tailwind config when cwd is not provided', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wtw-tailwind-config-cwd-'))
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    try {
      await writeFile(path.join(tempDir, 'tailwind.config.js'), 'export default {}')
      const runtime = createTailwindcssRuntime({
        tailwindcss: {
          resolve: {
            paths: [path.join(tempDir, 'node_modules')],
          },
        },
      })
      const callArgs = runtime.options as any
      expect(callArgs.tailwindcss?.config).toBe(path.join(tempDir, 'tailwind.config.js'))
      expect(callArgs.tailwindcss?.cwd).toBe(tempDir)
    }
    finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps missing package names in resolved options', async () => {
    const { createTailwindcssRuntime } = await import('@/tailwindcss')

    const runtime = createTailwindcssRuntime({
      tailwindcss: {
        packageName: 'missing-tailwindcss',
      },
    })

    expect(runtime.options?.tailwindcss?.packageName).toBe('missing-tailwindcss')
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })
})
