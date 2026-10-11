import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  detectAppType,
  detectAppTypeFromEnv,
  detectAppTypeFromPackageJson,
  isMpxPackage,
  isRunningInHBuilderX,
  isTaroPackage,
  isUniAppPackage,
  isUniAppVitePackage,
  isUniAppXPackage,
  isUniAppXManifest,
  isWeappVitePackage,
  resolveMpxPlatform,
  resolvePlatform,
  resolveTaroPlatform,
  resolveUniAppXPlatform,
  resolveUniPlatform,
  resolveUniPlatformsFromEnv,
  resolveUniUtsPlatform,
} from '../src'

const createdDirs: string[] = []

async function createProjectRoot(
  packageJson: Record<string, unknown>,
  extraFiles: string[] = [],
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-framework-'))
  createdDirs.push(rootDir)
  await writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf8',
  )
  for (const file of extraFiles) {
    const absolutePath = path.join(rootDir, file)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, '', 'utf8')
  }
  return rootDir
}

describe('framework detection helpers', () => {
  const originalEnv = {
    MPX_CLI_MODE: process.env['MPX_CLI_MODE'],
    MPX_CURRENT_TARGET_MODE: process.env['MPX_CURRENT_TARGET_MODE'],
    TARO_ENV: process.env['TARO_ENV'],
    UNI_PLATFORM: process.env['UNI_PLATFORM'],
    UNI_UTS_PLATFORM: process.env['UNI_UTS_PLATFORM'],
  }

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
    for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete process.env[key]
      }
      else {
        process.env[key] = value
      }
    }
  })

  it('detects single framework packages', () => {
    expect(isMpxPackage({ dependencies: { '@mpxjs/core': '^2.0.0' } })).toBe(true)
    expect(isTaroPackage({ dependencies: { '@tarojs/runtime': '^4.0.0' } })).toBe(true)
    expect(isUniAppVitePackage({ devDependencies: { '@dcloudio/vite-plugin-uni': '^3.0.0' } })).toBe(true)
    expect(isUniAppXPackage({ devDependencies: { '@dcloudio/uni-uts-v1': '^3.0.0' } })).toBe(true)
    expect(isUniAppPackage({ dependencies: { '@dcloudio/uni-app': '^3.0.0' } })).toBe(true)
    expect(isWeappVitePackage({ devDependencies: { 'weapp-vite': '^6.0.0' } })).toBe(true)
    expect(isUniAppXManifest({ 'uni-app-x': {} })).toBe(true)
  })

  it('detects app type from package json with stable priority', () => {
    expect(detectAppTypeFromPackageJson({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
        '@dcloudio/uni-uts-v1': '^3.0.0',
        '@dcloudio/vite-plugin-uni': '^3.0.0',
      },
    })).toBe('uni-app-x')
    expect(detectAppTypeFromPackageJson({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
        '@dcloudio/vite-plugin-uni': '^3.0.0',
      },
    })).toBe('uni-app-vite')
    expect(detectAppTypeFromPackageJson({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
        'weapp-vite': '^6.0.0',
      },
    })).toBe('weapp-vite')
  })

  it('detects HBuilderX runtime from cwd and missing NODE_PATH', () => {
    expect(isRunningInHBuilderX({
      cwd: '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite',
      env: {},
    })).toBe(true)
    expect(isRunningInHBuilderX({
      cwd: String.raw`E:\workspace\HBuilderX.4.87.2025121004\HBuilderX\plugins\uniapp-cli`,
      env: { NODE_PATH: '' },
    })).toBe(true)
    expect(isRunningInHBuilderX({
      cwd: '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli',
      env: { NODE_PATH: '/usr/local/lib/node_modules' },
    })).toBe(false)
  })

  it('resolves uni platform environment variables', () => {
    expect(resolvePlatform('WEB-CUSTOM')).toMatchObject({
      normalized: 'web-custom',
      isWeb: true,
      isApp: false,
    })
    expect(resolveTaroPlatform('weapp')).toMatchObject({
      normalized: 'weapp',
      isMp: true,
    })
    expect(resolveUniUtsPlatform('app-harmony')).toMatchObject({
      normalized: 'app-harmony',
      isApp: true,
      isAppHarmony: true,
      isWeb: false,
    })
    expect(resolveUniPlatformsFromEnv({
      UNI_PLATFORM: 'h5',
      UNI_UTS_PLATFORM: 'app-android',
    })).toMatchObject({
      uniPlatform: {
        isWeb: true,
      },
      uniUtsPlatform: {
        isAppAndroid: true,
      },
    })
  })

  it('resolves current framework platform from process env by default', () => {
    process.env['TARO_ENV'] = 'h5'
    process.env['UNI_PLATFORM'] = 'web'
    process.env['UNI_UTS_PLATFORM'] = 'app-ios'
    process.env['MPX_CURRENT_TARGET_MODE'] = 'wx'

    expect(resolveTaroPlatform()).toMatchObject({
      normalized: 'h5',
      isWeb: true,
    })
    expect(resolveUniPlatform()).toMatchObject({
      normalized: 'web',
      isWeb: true,
    })
    expect(resolveUniAppXPlatform()).toMatchObject({
      normalized: 'app-ios',
      isAppIos: true,
    })
    expect(resolveMpxPlatform()).toMatchObject({
      normalized: 'wx',
      isMp: true,
    })

    delete process.env['MPX_CURRENT_TARGET_MODE']
    process.env['MPX_CLI_MODE'] = 'web'
    expect(resolveMpxPlatform()).toMatchObject({
      normalized: 'web',
      isWeb: true,
    })
  })

  it('detects app type from framework environment variables', () => {
    expect(detectAppTypeFromEnv({ UNI_UTS_PLATFORM: 'app-android' })).toBe('uni-app-x')
    expect(detectAppTypeFromEnv({ UNI_PLATFORM: 'h5' })).toBe('uni-app-vite')
    expect(detectAppTypeFromEnv({ TARO_ENV: 'weapp' })).toBe('taro')
    expect(detectAppTypeFromEnv({ MPX_CLI_MODE: 'web' })).toBe('mpx')
    expect(detectAppTypeFromEnv(
      {},
      { cwd: '/Applications/HBuilderX.app/Contents/HBuilderX/plugins/uniapp-cli-vite' },
    )).toBe('uni-app-vite')
  })

  it('detects app type from env only when env detection is requested', async () => {
    const root = await createProjectRoot({})

    expect(detectAppType({ root, env: { TARO_ENV: 'h5' } })).toBe('taro')
    expect(detectAppType({ root })).toBeUndefined()
  })

  it('detects app type from root markers and config files', async () => {
    const mpxRoot = await createProjectRoot({}, ['src/app.mpx'])
    expect(detectAppType({ root: mpxRoot })).toBe('mpx')

    const uniAppXRoot = await createProjectRoot({}, ['manifest.json'])
    await writeFile(path.join(uniAppXRoot, 'manifest.json'), JSON.stringify({
      'uni-app-x': {},
    }, null, 2))
    expect(detectAppType({ root: uniAppXRoot })).toBe('uni-app-x')
  })

  it('searches parent directories by default', async () => {
    const root = await createProjectRoot({
      dependencies: {
        '@tarojs/runtime': '^4.0.0',
      },
    }, ['src/pages/index.ts'])
    const pageDir = path.join(root, 'src/pages')

    expect(detectAppType({ root: pageDir })).toBe('taro')
    expect(detectAppType({ root: pageDir, searchUp: false })).toBeUndefined()
  })

})
