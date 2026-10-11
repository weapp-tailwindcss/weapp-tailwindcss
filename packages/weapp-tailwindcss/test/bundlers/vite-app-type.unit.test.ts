import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveImplicitAppTypeFromViteRoot } from '@/bundlers/vite/resolve-app-type'

const createdDirs: string[] = []

async function createProjectRoot(
  packageJson: Record<string, unknown>,
  extraFiles: string[] = [],
) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-app-type-'))
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

describe('resolveImplicitAppTypeFromViteRoot', () => {
  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  it('detects taro from package dependencies', async () => {
    const rootDir = await createProjectRoot({
      dependencies: {
        '@tarojs/runtime': '^4.0.0',
      },
    })

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('taro')
  })

  it('detects weapp-vite from package dependencies', async () => {
    const rootDir = await createProjectRoot({
      dependencies: {
        'weapp-vite': '^6.0.0',
      },
    })

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('weapp-vite')
  })

  it('detects uni-app vite from vite plugin dependency', async () => {
    const rootDir = await createProjectRoot({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
      },
      devDependencies: {
        '@dcloudio/vite-plugin-uni': '^3.0.0',
      },
    })

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('uni-app-vite')
  })

  it('detects uni-app-x from manifest', async () => {
    const rootDir = await createProjectRoot({}, ['manifest.json'])
    await writeFile(path.join(rootDir, 'manifest.json'), JSON.stringify({
      'uni-app-x': {},
    }, null, 2))

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('uni-app-x')
  })

  it('detects uni-app-x from package dependencies', async () => {
    const rootDir = await createProjectRoot({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
      },
      devDependencies: {
        '@dcloudio/uni-uts-v1': '^3.0.0',
        '@dcloudio/vite-plugin-uni': '^3.0.0',
      },
    })

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('uni-app-x')
  })

  it('detects mpx from root markers', async () => {
    const rootDir = await createProjectRoot({}, ['src/app.mpx'])

    expect(resolveImplicitAppTypeFromViteRoot(rootDir)).toBe('mpx')
  })

  it('can stop framework detection at the nearest Vite package boundary', async () => {
    const rootDir = await createProjectRoot({})
    const childDir = path.join(rootDir, 'packages', 'web')
    await mkdir(childDir, { recursive: true })
    await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
      dependencies: { 'weapp-vite': '^6.0.0' },
    }), 'utf8')
    await writeFile(path.join(childDir, 'package.json'), JSON.stringify({ name: 'web' }), 'utf8')

    expect(resolveImplicitAppTypeFromViteRoot(childDir, { searchUp: false })).toBeUndefined()
    expect(resolveImplicitAppTypeFromViteRoot(childDir)).toBe('weapp-vite')
  })

  it('finds the nearest package when Vite root points into its src directory', async () => {
    const rootDir = await createProjectRoot({
      dependencies: { '@tarojs/runtime': '^4.0.0' },
    })
    const srcDir = path.join(rootDir, 'src')
    await mkdir(srcDir, { recursive: true })

    expect(resolveImplicitAppTypeFromViteRoot(srcDir, { searchUp: false })).toBe('taro')
  })
})
