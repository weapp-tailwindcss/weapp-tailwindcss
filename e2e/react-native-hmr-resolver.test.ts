import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { withMetroHmrObservation, sameSourcePath, originalAlias, request } = require('./react-native/hmr-observation/config.cjs')

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rn-hmr-resolver-'))
  roots.push(root)
  const utilitiesPath = path.join(root, 'Utilities.js')
  const wrapperPath = path.join(root, 'wrapper.cjs')
  const client = path.join(root, 'client', 'HMRClient.js')
  mkdirSync(path.dirname(client))
  writeFileSync(client, 'module.exports = class RealHmrClient {}')
  writeFileSync(path.join(root, 'client', 'package.json'), JSON.stringify({ name: 'metro-runtime', version: 'actual-resolver-version' }))
  writeFileSync(utilitiesPath, 'require("metro-runtime/src/modules/HMRClient")')
  writeFileSync(wrapperPath, 'require("weapp-tailwind-e2e-original-hmr-client")')
  writeFileSync(path.join(root, 'hmr-observation.cjs'), 'module.exports = {}')
  const metroConfigPath = path.join(root, 'metro.config.js')
  writeFileSync(metroConfigPath, 'module.exports = {}')
  const directory = path.join(root, 'archive')
  const environment = { RN_METRO_HMR_ARCHIVE: JSON.stringify({ directory, utilitiesPath, wrapperPath, metroConfigPath, identity: { runId: 'run', invocationId: 'invocation' } }) }
  return { root, utilitiesPath, wrapperPath, client, directory, environment }
}

describe('准确 HMR resolver 接线', () => {
  it('不启用时保留原配置身份', () => {
    const config = {}
    expect(withMetroHmrObservation(config, {})).toBe(config)
  })

  it.each(['android', 'ios'])('先委托原链，保存真实源码及包身份，alias只在wrapper中生效：%s', (platform) => {
    const f = fixture()
    const original = { type: 'sourceFile', filePath: f.client }
    const resolver = {
      resolveRequest: vi.fn(function (this: unknown) {
        expect(this).toBe(resolver)
        return original
      }),
    }
    const config = withMetroHmrObservation({ projectRoot: f.root, resolver }, f.environment)
    const context = { originModulePath: f.utilitiesPath }
    expect(config.resolver.resolveRequest(context, request, platform)).toEqual({ type: 'sourceFile', filePath: realpathSync(f.wrapperPath) })
    expect(resolver.resolveRequest).toHaveBeenCalledExactlyOnceWith(context, request, platform)
    expect(config.resolver.resolveRequest({ originModulePath: f.wrapperPath }, originalAlias, platform)).toBe(original)
    expect(resolver.resolveRequest).toHaveBeenCalledTimes(1)
    const receipt = JSON.parse(readFileSync(path.join(f.directory, `${platform}-resolver.json`), 'utf8'))
    expect(receipt).toMatchObject({ evidence: 'resolver-result', resolvedPath: f.client, clientPackage: { version: 'actual-resolver-version' } })
    expect(receipt.clientSourceSha256).toBe(createHash('sha256').update(readFileSync(f.client)).digest('hex'))
    expect(readFileSync(path.join(f.directory, `${platform}-client-source.js`))).toEqual(readFileSync(f.client))
    config.resolver.resolveRequest({ originModulePath: f.utilitiesPath }, originalAlias, platform)
    expect(resolver.resolveRequest).toHaveBeenCalledTimes(2)
  })

  it.each(['web', 'windows', null])('Web和其它平台完整保留原链：%s', (platform) => {
    const f = fixture()
    const original = { type: 'sourceFile', filePath: f.client }
    const resolveRequest = vi.fn(() => original)
    const config = withMetroHmrObservation({}, f.environment)
    expect(config.resolver.resolveRequest({ originModulePath: f.utilitiesPath, resolveRequest }, request, platform)).toBe(original)
    expect(resolveRequest).toHaveBeenCalledTimes(1)
  })

  it('不同origin、不同request不拦截，原异常不吞掉，禁止跨平台alias', () => {
    const f = fixture()
    const failure = new Error('original resolver failed')
    const resolveRequest = vi.fn(() => {
      throw failure
    })
    const config = withMetroHmrObservation({}, f.environment)
    expect(() => config.resolver.resolveRequest({ originModulePath: f.utilitiesPath, resolveRequest }, request, 'ios')).toThrow(failure)
    expect(() => config.resolver.resolveRequest({ originModulePath: f.wrapperPath, resolveRequest }, originalAlias, 'android')).toThrow('同平台')
    const original = { type: 'sourceFile', filePath: f.client }
    resolveRequest.mockImplementation(() => original as never)
    expect(config.resolver.resolveRequest({ originModulePath: f.wrapperPath, resolveRequest }, request, 'ios')).toBe(original)
    expect(config.resolver.resolveRequest({ originModulePath: f.utilitiesPath, resolveRequest }, `${request}/other`, 'ios')).toBe(original)
  })

  it('文件系统路径合同覆盖POSIX、Windows盘符、UNC及相对路径', () => {
    expect(sameSourcePath('/workspace/a/../b.js', '/workspace/b.js', path.posix)).toBe(true)
    expect(sameSourcePath('C:\\workspace\\a\\..\\b.js', 'C:\\workspace\\b.js', path.win32)).toBe(true)
    expect(sameSourcePath('C:\\workspace\\b.js', 'D:\\workspace\\b.js', path.win32)).toBe(false)
    expect(sameSourcePath('\\\\server\\share\\a\\..\\b.js', '\\\\server\\share\\b.js', path.win32)).toBe(true)
    expect(sameSourcePath('./a/../b.js', './b.js', path.posix)).toBe(true)
  })
})
