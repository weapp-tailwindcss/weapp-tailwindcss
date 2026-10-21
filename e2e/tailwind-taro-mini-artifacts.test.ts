import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { taroMiniCase } from './multiplatform-build-output/case-factories/taro-mini'
import { verifyBuildOutputCase } from './multiplatform-build-output/runner'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(options: { template?: string, targetStyle?: string, foreignStyle?: string } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'taro-mini-output-'))
  roots.push(root)
  const files = {
    'dist/app.js': 'App({})',
    'dist/app.json': '{"pages":["pages/index/index"]}',
    'dist/app.qss': options.targetStyle ?? '.marker{color:red}',
    'dist/pages/index/index.qml': options.template ?? '<template is="root" data="{{root}}"/>',
    'dist/pages/index/index.js': 'const className="marker"',
    ...(options.foreignStyle === undefined ? {} : { 'dist/app.wxss': options.foreignStyle }),
  }
  for (const [relative, source] of Object.entries(files)) {
    const file = path.resolve(root, relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, source)
  }
  vi.stubEnv('E2E_MULTIPLATFORM_BUILD_SKIP_BUILD', '1')
  return {
    ...taroMiniCase({ project: 'fixture', packageName: 'fixture', platform: 'qq', styleContains: ['.marker'], textContains: ['marker'] }),
    projectDir: root,
    verifySourceFixtures: false,
  }
}

it('接受目标平台样式、模板结构和脚本证据齐全的产物', async () => {
  await expect(verifyBuildOutputCase(await fixture())).resolves.toBeUndefined()
})

it('拒绝空模板，即使脚本与样式仍有正确标记', async () => {
  await expect(verifyBuildOutputCase(await fixture({ template: '' }))).rejects.toThrow()
})

it('拒绝以其它平台样式代证空的目标后缀样式', async () => {
  await expect(verifyBuildOutputCase(await fixture({ targetStyle: '', foreignStyle: '.marker{color:red}' }))).rejects.toThrow()
})

it.each(['utility', 'variant', 'custom-variant', 'reference', 'config', 'plugin'])('拒绝非空的 @%s 构建指令残留', async (directive) => {
  await expect(verifyBuildOutputCase(await fixture({ targetStyle: `.marker{color:red}@${directive} custom{.leak{color:blue}}` }))).rejects.toThrow()
})
