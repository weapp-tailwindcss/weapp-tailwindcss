import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectAppType } from '../src'
import { parseManifestJson } from '../src/manifest'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(manifest: string, pkg = '{"private":true}') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uni manifest '))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), pkg)
  await writeFile(path.join(root, 'manifest.json'), manifest)
  return root
}

describe('Uni manifest 注释读取', () => {
  it.each([
    '{"uni-app-x": {}}',
    '{ /* manifest comment */ "uni-app-x": {} }',
    '{\n // manifest comment\n "uni-app-x": {}\n}',
    '{\r\n // manifest comment\r\n "uni-app-x": {}\r\n}',
    '{"uni-app-x": {}} // comment at EOF',
    '/* before */ {"uni-app-x": { /* inside */ }} /* after */',
    '{ "name": "Hello uni-app x", "uni-app-x": {}, /* 快应用特有相关 */ "quickapp": {} }',
  ])('识别严格 JSON 及合法注释 %s', async (manifest) => {
    const root = await fixture(manifest)
    expect(detectAppType({ root, searchUp: false, env: {} })).toBe('uni-app-x')
  })

  it.each([
    'https://example.com/a//b',
    '/* string content */ // content',
    'escaped " quote and \\ backslash',
    'two backslashes \\\\ then " quote',
    '中文与 emoji 😀 // /*',
  ])('注释扫描保留字符串内容 %s', async (description) => {
    const manifest = `/* before */ ${JSON.stringify({ description, 'uni-app-x': {} })} // after`
    expect(parseManifestJson(manifest)).toEqual({ description, 'uni-app-x': {} })
    const root = await fixture(manifest)
    expect(detectAppType({ root, searchUp: false, env: {} })).toBe('uni-app-x')
  })

  it.each([
    '{"uni-app-x": {}} /* unterminated',
    '{"uni-app-x": {}, "enabled": tr/* comment */ue}',
    '{"uni-app-x": {}, "value": 1/* comment */2}',
    '{"uni-app-x": {},}',
    '{"uni-app-x": {}, "description": "unterminated}',
  ])('损坏的 manifest 不能恢复为部分有效对象 %s', async (manifest) => {
    const root = await fixture(manifest)
    expect(detectAppType({ root, searchUp: false, env: {} })).toBeUndefined()
  })

  it('损坏 manifest 保持父目录回退及 searchUp 边界', async () => {
    const root = await fixture('{ /* valid */ "uni-app-x": {} }')
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await writeFile(path.join(nested, 'manifest.json'), '{"uni-app-x": {}} /*')
    expect(detectAppType({ root: nested, env: {} })).toBe('uni-app-x')
    expect(detectAppType({ root: nested, searchUp: false, env: {} })).toBeUndefined()
  })

  it('package.json 继续使用严格 JSON', async () => {
    const root = await fixture('{}', '{ /* comment */ "dependencies": { "@tarojs/runtime": "*" } }')
    expect(detectAppType({ root, searchUp: false, env: {} })).toBeUndefined()
    await writeFile(path.join(root, 'package.json'), '{"dependencies":{"@tarojs/runtime":"*"}}')
    expect(detectAppType({ root, searchUp: false, env: {} })).toBe('taro')
  })

  it('注释 manifest 保持显式配置和 marker 优先级', async () => {
    const root = await fixture('{ /* valid */ "uni-app-x": {} }')
    const options = { root, searchUp: false, env: {} }
    expect(detectAppType({ ...options, packageJson: { dependencies: { '@tarojs/runtime': '*' } } })).toBe('taro')
    await writeFile(path.join(root, 'app.mpx'), '')
    expect(detectAppType(options)).toBe('mpx')
    expect(detectAppType({ ...options, manifest: { 'uni-app-x': {} } })).toBe('uni-app-x')
  })
})
