import fs from 'node:fs/promises'
import path from 'node:path'

export async function createServiceFixture(root, source = '', entryFile = 'mpx-cli-service.mjs') {
  const cwd = path.join(root, '中文 demo space')
  const serviceDirectory = path.join(cwd, 'node_modules', '@mpxjs', 'mpx-cli-service')
  await fs.mkdir(path.join(serviceDirectory, 'bin'), { recursive: true })
  await fs.writeFile(path.join(cwd, 'package.json'), '{"type":"module"}', 'utf8')
  await fs.writeFile(path.join(serviceDirectory, 'package.json'), JSON.stringify({
    name: '@mpxjs/mpx-cli-service',
    type: 'module',
    bin: { 'mpx-cli-service': path.posix.join('bin', entryFile) },
  }), 'utf8')
  const entry = path.join(serviceDirectory, 'bin', entryFile)
  await fs.writeFile(entry, source, 'utf8')
  return { cwd, entry }
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

export function versionFor(root) {
  return { version: 'current:fixture', root, diagnosticIdentity: { role: 'current', sourceCommit: 'a'.repeat(40) } }
}
