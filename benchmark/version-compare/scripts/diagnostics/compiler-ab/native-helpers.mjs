import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { readPackage, sha256 } from './identity.mjs'
import { projectRelative } from './lock-axis.mjs'

/** 只领取本副本已安装的官方 esbuild service 二进制，运行时仍逐次复核路径、内容及准确参数。 */
export function nativeEsbuildHelpers(root, identity) {
  const project = path.join(root, projectRelative)
  const cli = readPackage(project, '@tarojs/cli')
  const helper = readPackage(cli.directory, '@tarojs/helper')
  const seeds = [project, cli.directory, helper.directory, identity.runner.directory, identity.minimizers.terserPlugin.directory, identity.optionalCompilerContext.terser.directory]
  const helpers = new Map(), packages = new Map(), unresolved = []
  for (const from of seeds) {
    let esbuild
    try { esbuild = readPackage(from, 'esbuild') }
    catch { unresolved.push(from); continue }
    assert.ok(['0.21.5', '0.28.2'].includes(esbuild.version), '发现合同外的 esbuild service 版本')
    if (packages.has(esbuild.directory)) continue
    packages.set(esbuild.directory, esbuild)
    const manifestFile = path.join(esbuild.directory, 'package.json')
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    const require = createRequire(manifestFile)
    let found = 0
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      if (!name.startsWith('@esbuild/')) continue
      let nativeManifestFile
      try { nativeManifestFile = fs.realpathSync(require.resolve(`${name}/package.json`)) }
      catch { continue }
      const native = JSON.parse(fs.readFileSync(nativeManifestFile, 'utf8'))
      assert.equal(native.name, name)
      assert.equal(native.version, esbuild.version)
      assert.ok(native.os.includes(process.platform) && native.cpu.includes(process.arch), 'esbuild 二进制平台身份不符')
      const binary = fs.realpathSync(process.platform === 'win32' ? path.join(path.dirname(nativeManifestFile), 'esbuild.exe') : path.join(path.dirname(nativeManifestFile), 'bin', 'esbuild'))
      helpers.set(binary, { path: binary, sha256: sha256(fs.readFileSync(binary)), args: [`--service=${esbuild.version}`, '--ping'], name, version: native.version, manifestSha256: sha256(fs.readFileSync(nativeManifestFile)) })
      found += 1
    }
    assert.equal(found, 1, '每个实际 esbuild 必须领取唯一平台 service')
  }
  assert.ok(helpers.size > 0, '没有可验证的原生 service 身份')
  return { helpers: [...helpers.values()].sort((a, b) => a.path.localeCompare(b.path, 'en')), packages: [...packages.values()], unresolved }
}
