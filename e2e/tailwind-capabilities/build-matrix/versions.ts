import type { BuildOutputCase } from '../../multiplatform-build-output/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readInstalledVersion } from '../../lynx/versions'
import { documentedOnly } from './cases'

const buildPackages = new Set(['@tarojs/cli', '@tarojs/vite-runner', '@tarojs/webpack5-runner', '@mpxjs/cli-service', '@mpxjs/webpack-plugin', '@dcloudio/uni-app', '@dcloudio/vite-plugin-uni', 'gulp', 'vite', 'webpack', 'tailwindcss'])

/** 各 demo 的构建器可能不同版，读取实际安装包而非 manifest 范围。 */
export async function buildMatrixVersions(root: string, cases: readonly BuildOutputCase[]) {
  const versions: Record<string, string> = {}
  for (const project of new Set(cases.filter(item => !documentedOnly(item)).map(item => item.projectDir))) {
    const manifest = path.join(root, project, 'package.json')
    const definition = JSON.parse(await readFile(manifest, 'utf8')) as { dependencies?: Record<string, string>, devDependencies?: Record<string, string> }
    for (const name of Object.keys({ ...definition.dependencies, ...definition.devDependencies }).filter(name => buildPackages.has(name)).sort()) {
      versions[`${project}:${name}`] = readInstalledVersion(manifest, name)
    }
  }
  return versions
}
