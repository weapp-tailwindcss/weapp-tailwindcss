import fs from 'node:fs/promises'
import path from 'node:path'

export async function createServiceFixture(root, source = '', entryFile = 'mpx-cli-service.mjs', metadata = { packageName: '@mpxjs/mpx-cli-service', binName: 'mpx-cli-service' }) {
  const cwd = path.join(root, '中文 demo space')
  const serviceDirectory = path.join(cwd, 'node_modules', metadata.packageName)
  await fs.mkdir(path.join(serviceDirectory, 'bin'), { recursive: true })
  await fs.writeFile(path.join(cwd, 'package.json'), '{"type":"module"}', 'utf8')
  await fs.writeFile(path.join(serviceDirectory, 'package.json'), JSON.stringify({
    name: metadata.packageName,
    type: 'module',
    bin: { [metadata.binName]: path.posix.join('bin', entryFile) },
  }), 'utf8')
  const entry = path.join(serviceDirectory, 'bin', entryFile)
  await fs.writeFile(entry, source, 'utf8')
  return { cwd, entry }
}

export function createUniServiceFixture(root, source = '') {
  return createServiceFixture(root, source, 'uni.mjs', { packageName: '@dcloudio/vite-plugin-uni', binName: 'uni' })
}

export const mpxProject = {
  key: 'demo-mpx-tailwindcss-v4__mp-weixin',
  project: '中文 demo space',
  buildScript: 'fixture-build',
  devScript: 'fixture-dev',
  sourceFile: 'source.mpx',
  outputTemplate: 'output.wxml',
  injectType: 'vue',
  watchReadyLog: 'fixture-ready',
}

export const uniProject = {
  ...mpxProject,
  key: 'demo-uni-app-vite-tailwindcss-v4__mp-weixin',
  sourceFile: 'source.vue',
}

export function versionFor(root) {
  return { version: 'current:fixture', root, diagnosticIdentity: { role: 'current', sourceCommit: 'a'.repeat(40) } }
}
