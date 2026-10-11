import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { connectScriptSidecar, scriptSidecarOwner } from '../authored-script.mjs'

it('静态注入 CSS 必须由已登记的实际页面导入，不能仅写入未被消费的 sidecar', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'cost-taro-sidecar-'))
  try {
    const style = path.join(project, 'entry.css')
    await writeFile(path.join(project, 'entry.tsx'), 'export default () => <View/>')
    const result = new Map([['entry.css', '.injected{height:8rpx}']])
    await connectScriptSidecar(result, project, style, ['entry.tsx', 'entry.config.ts'])
    expect(result.get('entry.tsx')).toContain('import "./entry.css"')
    const source = result.get('entry.tsx')
    await connectScriptSidecar(result, project, style, ['entry.tsx', 'entry.config.ts'])
    expect(result.get('entry.tsx')).toBe(source)
    expect(result.has('entry.config.ts')).toBe(false)
  }
  finally { await rm(project, { recursive: true, force: true }) }
})

it('脚本 sidecar 归属支持不同根与路径格式，缺失或歧义直接失败', () => {
  expect(scriptSidecarOwner('/app', 'feature/entry.css', ['feature/entry.tsx'], path.posix)).toBe('/app/feature/entry.tsx')
  expect(scriptSidecarOwner('C:\\app', 'feature\\entry.css', ['C:\\app\\feature\\entry.jsx'], path.win32)).toBe('C:\\app\\feature\\entry.jsx')
  expect(() => scriptSidecarOwner('C:\\app', 'feature\\entry.css', ['D:\\app\\feature\\entry.jsx'], path.win32)).toThrow('源码归属')
  expect(() => scriptSidecarOwner('/app', 'entry.css', ['entry.ts', 'entry.tsx'], path.posix)).toThrow('源码归属')
})
