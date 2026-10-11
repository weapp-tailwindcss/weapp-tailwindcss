import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getRegisteredManifest, getVirtualModuleCode, VIRTUAL_MANIFEST_MODULE, withWeappTailwindcss } from '@/metro'
import { transform } from '@/metro-transformer'

describe('Expo Metro integration', () => {
  it('registers CSS and resolves the watched virtual manifest module', async () => {
    const config = withWeappTailwindcss({ resolver: { sourceExts: ['js'] } }, {
      css: '.flex { display: flex; }',
      classSet: ['flex'],
    })
    expect(config.resolver?.sourceExts).toEqual(['js', 'css'])
    const resolved = config.resolver?.resolveRequest?.({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { type: string, filePath: string }
    expect(resolved.type).toBe('sourceFile')
    expect(fs.existsSync(resolved.filePath)).toBe(true)
    const relativeVirtualPath = path.relative(path.resolve(process.cwd()), resolved.filePath)
    expect(relativeVirtualPath.startsWith('..')).toBe(false)
    expect(path.isAbsolute(relativeVirtualPath)).toBe(false)
    expect(config.watchFolders).toContain(path.dirname(resolved.filePath))
    expect(config.transformerPath).toContain('metro-transformer')
    expect(getVirtualModuleCode(resolved.filePath)).toContain('"display":"flex"')
    expect(getVirtualModuleCode(resolved.filePath)).toContain('setStyleSheetFactory(StyleSheet.create)')
    const id = (config.transformer as Record<string, unknown>).weappTailwindcssMetroId as string
    const manifestPath = (config.transformer as Record<string, unknown>).weappTailwindcssManifestPath as string
    expect(manifestPath).toContain('.manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
    expect((config.transformer as Record<string, unknown>).weappTailwindcssManifestReadyPath).toContain('.manifest.ready')
    expect((config.transformer as Record<string, unknown>).weappTailwindcssVirtualModulePath).toContain('.js')
    await expect(getRegisteredManifest(id)).resolves.toMatchObject({ staticLookup: { flex: expect.any(Array) } })
  })

  it('accepts an async Expo config factory', async () => {
    const config = await withWeappTailwindcss(async () => ({ resolver: { sourceExts: ['js'] } }), {
      css: '.flex { display: flex; }',
      classSet: ['flex'],
    })
    expect(config.resolver?.sourceExts).toEqual(['js', 'css'])
  })

  it('anchors dependencies imported by the temporary virtual module to projectRoot', () => {
    const projectRoot = path.resolve('fixtures/react-native-app')
    let resolvedOrigin = ''
    const config = withWeappTailwindcss({
      resolver: {
        sourceExts: ['js'],
        resolveRequest(context) {
          resolvedOrigin = (context as { originModulePath: string }).originModulePath
          return { type: 'empty' }
        },
      },
    }, {
      projectRoot,
      css: '.flex { display: flex; }',
      classSet: ['flex'],
    })
    const virtual = config.resolver?.resolveRequest?.({}, VIRTUAL_MANIFEST_MODULE, 'android') as { filePath: string }

    config.resolver?.resolveRequest?.({ originModulePath: virtual.filePath }, 'react-native', 'android')

    expect(resolvedOrigin).toBe(path.join(projectRoot, 'package.json'))
  })

  it('pins the Web React singleton through Metro extraNodeModules', () => {
    const projectRoot = path.resolve('fixtures/react-native-app')
    const config = withWeappTailwindcss({}, { projectRoot })
    expect(config.resolver?.extraNodeModules?.react).toBe(path.join(projectRoot, 'node_modules/react'))
    expect(config.resolver?.extraNodeModules?.['react-dom']).toBe(path.join(projectRoot, 'node_modules/react-dom'))
  })

  it.each(['react', 'react/jsx-runtime', 'react-native', 'react-native/Libraries/Utilities/Platform'])('resolves singleton module %s from projectRoot', (moduleName) => {
    const projectRoot = path.resolve('fixtures/react-native-app')
    let resolvedOrigin = ''
    const config = withWeappTailwindcss({
      resolver: {
        resolveRequest(context) {
          resolvedOrigin = (context as { originModulePath: string }).originModulePath
          return { type: 'empty' }
        },
      },
    }, { projectRoot })

    config.resolver?.resolveRequest?.({ originModulePath: path.resolve('packages/workspace-package/index.js') }, moduleName, 'ios')

    expect(resolvedOrigin).toBe(path.join(projectRoot, 'package.json'))
  })

  it('resolves react-native-web from the Web app root', () => {
    const importer = path.resolve('packages/workspace-package/index.js')
    let resolvedOrigin = ''
    const config = withWeappTailwindcss({
      resolver: {
        resolveRequest(context) {
          resolvedOrigin = (context as { originModulePath: string }).originModulePath
          return { type: 'empty' }
        },
      },
    }, { projectRoot: path.resolve(__dirname, '../../examples/react-native-expo') })

    const resolved = config.resolver?.resolveRequest?.({ originModulePath: importer }, 'react-native-web', 'web') as { type: string, filePath: string }

    expect(resolved.type).toBe('sourceFile')
    expect(String(resolved.filePath)).toContain('react-native-web')
  })

  it('resolves the Web React Native Web singleton from the project root', () => {
    const projectRoot = path.resolve(__dirname, '../../examples/react-native-expo')
    const config = withWeappTailwindcss({}, { projectRoot })
    const resolved = config.resolver?.resolveRequest?.({}, 'react-native-web', 'web') as { type: string, filePath: string }

    expect(resolved.type).toBe('sourceFile')
    expect(String(resolved.filePath)).toContain('react-native-web')
  })

  it('resolves the Web React singleton from the project root', () => {
    const importer = path.resolve('packages/workspace-package/index.js')
    const configRoot = path.resolve(__dirname, '../../examples/react-native-expo')
    let resolvedOrigin = ''
    const config = withWeappTailwindcss({
      resolver: {
        resolveRequest(context) {
          resolvedOrigin = (context as { originModulePath: string }).originModulePath
          return { type: 'empty' }
        },
      },
    }, { projectRoot: configRoot })

    const resolved = config.resolver?.resolveRequest?.({ originModulePath: importer }, 'react', 'web') as { type: string, filePath: string }

    expect(resolved.type).toBe('sourceFile')
    expect(String(resolved.filePath)).toMatch(/(?:^|[\\/])react[\\/]index\.js$/)
    expect(resolvedOrigin).toBe('')
  })

  it('preserves the Web resolver graph for react-native', () => {
    const importer = path.resolve('packages/workspace-package/index.js')
    let resolvedOrigin = ''
    const configRoot = path.resolve('fixtures/react-native-app')
    const config = withWeappTailwindcss({
      resolver: {
        resolveRequest(context) {
          resolvedOrigin = (context as { originModulePath: string }).originModulePath
          return { type: 'empty' }
        },
      },
    }, { projectRoot: configRoot })

    config.resolver?.resolveRequest?.({ originModulePath: importer }, 'react-native', 'web')

    expect(resolvedOrigin).toBe(importer)
  })

  it('passes the virtual manifest through the original Expo transformer', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-transformer-'))
    try {
      const transformerPath = path.join(temporaryRoot, 'transformer.cjs')
      fs.writeFileSync(transformerPath, `exports.transform = (_config, _root, filename, data) => ({ filename, code: data.toString(), dependencies: ['react-native'] })\n`)
      const config = withWeappTailwindcss({ transformerPath }, {
        projectRoot: temporaryRoot,
        css: '.flex { display: flex; }',
        classSet: ['flex'],
      })
      const virtual = config.resolver?.resolveRequest?.({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { filePath: string }
      const result = await transform(config.transformer ?? {}, temporaryRoot, virtual.filePath, Buffer.from('untransformed'), {}) as { code: string, dependencies: string[] }

      expect(result.code).toContain('setManifest(')
      expect(result.code).not.toContain('untransformed')
      expect(result.dependencies).toEqual(['react-native'])
    }
    finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('waits for the registered manifest when Metro omits its custom id', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-manifest-path-'))
    try {
      const transformerPath = path.join(temporaryRoot, 'transformer.cjs')
      fs.writeFileSync(transformerPath, `exports.transform = (_config, _root, filename, data) => ({ filename, code: data.toString(), dependencies: [] })\n`)
      const config = withWeappTailwindcss({ transformerPath }, {
        projectRoot: temporaryRoot,
        css: '.flex { display: flex; }',
        classSet: ['flex'],
      })
      const transformerConfig = { ...(config.transformer ?? {}) } as Record<string, unknown>
      delete transformerConfig.weappTailwindcssMetroId
      const result = await transform(transformerConfig, temporaryRoot, path.join(temporaryRoot, 'Screen.tsx'), Buffer.from('<View className="flex" />'), {}) as { code: string }

      expect(result.code).toMatch(/_twStatic\(\["s[a-z0-9]+"\]\)/)
      expect(result.code).not.toContain('className')
    }
    finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('uses the project root when Metro omits manifest metadata', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-manifest-root-'))
    try {
      const transformerPath = path.join(temporaryRoot, 'transformer.cjs')
      fs.writeFileSync(transformerPath, `exports.transform = (_config, _root, filename, data) => ({ filename, code: data.toString(), dependencies: [] })\n`)
      const config = withWeappTailwindcss({ transformerPath }, {
        projectRoot: temporaryRoot,
        css: '.flex { display: flex; }',
        classSet: ['flex'],
      })
      const transformerConfig = { ...(config.transformer ?? {}) } as Record<string, unknown>
      delete transformerConfig.weappTailwindcssMetroId
      delete transformerConfig.weappTailwindcssManifestPath
      const result = await transform(transformerConfig, temporaryRoot, path.join(temporaryRoot, 'Screen.tsx'), Buffer.from('<View className="flex" />'), {}) as { code: string }

      expect(result.code).toMatch(/_twStatic\(\["s[a-z0-9]+"\]\)/)
      expect(result.code).not.toContain('className')
    }
    finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('reads the project manifest when the transformer runs in a fresh worker', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-manifest-worker-'))
    try {
      const transformerPath = path.join(temporaryRoot, 'transformer.cjs')
      fs.writeFileSync(transformerPath, `exports.transform = (_config, _root, filename, data) => ({ filename, code: data.toString(), dependencies: [] })\n`)
      const config = withWeappTailwindcss({ transformerPath }, {
        projectRoot: temporaryRoot,
        css: '.flex { display: flex; }',
        classSet: ['flex'],
      })
      const transformerConfig = { ...(config.transformer ?? {}) } as Record<string, unknown>
      const originalTransformerPath = transformerConfig.weappTailwindcssOriginalTransformerPath
      for (const key of Object.keys(transformerConfig)) {
        if (key.startsWith('weappTailwindcss')) { delete transformerConfig[key] }
      }
      transformerConfig.weappTailwindcssOriginalTransformerPath = originalTransformerPath
      const result = await transform(transformerConfig, temporaryRoot, path.join(temporaryRoot, 'Screen.tsx'), Buffer.from('<View className="flex" />'), {}) as { code: string }

      expect(result.code).toMatch(/_twStatic\(\["s[a-z0-9]+"\]\)/)
      expect(result.code).not.toContain('className')
    }
    finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('does not prefer an empty manifest file over a registered project manifest', async () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-empty-manifest-'))
    try {
      const transformerPath = path.join(temporaryRoot, 'transformer.cjs')
      const emptyManifestPath = path.join(temporaryRoot, 'stale.manifest.json')
      fs.writeFileSync(transformerPath, `exports.transform = (_config, _root, filename, data) => ({ filename, code: data.toString(), dependencies: [] })\n`)
      fs.writeFileSync(emptyManifestPath, JSON.stringify({ version: 1, classSet: [], rules: {}, variables: {}, warnings: [] }))
      const config = withWeappTailwindcss({ transformerPath }, {
        projectRoot: temporaryRoot,
        css: '.flex { display: flex; }',
        classSet: ['flex'],
      })
      const transformerConfig = { ...(config.transformer ?? {}), weappTailwindcssManifestPath: emptyManifestPath } as Record<string, unknown>
      delete transformerConfig.weappTailwindcssMetroId
      const result = await transform(transformerConfig, temporaryRoot, path.join(temporaryRoot, 'Screen.tsx'), Buffer.from('<View className="flex" />'), {}) as { code: string }

      expect(result.code).toMatch(/_twStatic\(\["s[a-z0-9]+"\]\)/)
      expect(result.code).not.toContain('className')
    }
    finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
