import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { consumptionGraph, sha256 } from '../scripts/watch-consumer/consumption-graph.mjs'
import { withScratch } from '../scripts/watch-consumer/index.mjs'

function chunk(fileName, imports, importedCss, isEntry = false) {
  return {
    type: 'chunk',
    fileName,
    imports,
    importedCss,
    isEntry,
  }
}
function asset(fileName, source) {
  return {
    type: 'asset',
    fileName,
    source,
  }
}
describe('watch 静态消费图诊断 fixture', () => {
  it('分别记录独立入口闭包，保留共享 CSS、循环与真实 source', () => {
    const common = ':root{--accent:red}'
    const snapshot = {
      outputs: [chunk('main.js', ['shared.js'], ['main.css'], true), chunk('secondary.js', ['shared.js'], ['secondary.css'], true), chunk('shared.js', ['main.js'], ['common.css']), asset('main.css', '.main{color:red}'), asset('secondary.css', Buffer.from('.secondary{color:blue}')), asset('common.css', common)],
    }
    const result = consumptionGraph(snapshot, postcss)
    expect(result.staticMembershipComplete).toBe(true)
    expect(result.entries[0].cssFiles).toEqual(['common.css', 'main.css'])
    expect(result.entries[1].cssFiles).toEqual(['main.css', 'common.css', 'secondary.css'])
    expect(result.entries[0].cssSources[0]).toEqual({
      fileName: 'common.css',
      sha256: sha256(common),
      source: common,
    })
    expect(result.entries[1].cssSources.at(-1).source).toBe('.secondary{color:blue}')
  })
  it('缺失 chunk、CSS 或存在 CSS import 时不声明闭包完整', () => {
    const result = consumptionGraph({
      outputs: [chunk('main.js', ['external.js'], ['missing.css', 'main.css'], true), asset('main.css', '@import "./other.css"; .main{color:red}')],
    }, postcss)
    expect(result.staticMembershipComplete).toBe(false)
    expect(result.entries[0].unresolved).toEqual([{
      type: 'js-import',
      file: 'external.js',
    }, {
      type: 'css-asset',
      file: 'missing.css',
    }, {
      type: 'css-import-not-expanded',
      file: 'main.css',
      params: '"./other.css"',
    }])
    expect(consumptionGraph({
      outputs: [asset('isolated.css', '.a{}')],
    }, postcss).staticMembershipComplete).toBe(false)
  })
  it('动态导入失败后回收 scratch 且保留原始错误', async () => {
    let owned
    const missing = new Error('fixture-before-import')
    await expect(withScratch(async (scratch) => {
      owned = scratch
      throw missing
    })).rejects.toBe(missing)
    await expect(fs.stat(owned)).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(withScratch(async (scratch) => {
      owned = scratch
      const module = path.join(scratch, 'fails.mjs')
      await fs.writeFile(module, 'throw new Error("fixture-import")\n')
      await import(pathToFileURL(module).href)
    })).rejects.toThrow('fixture-import')
    await expect(fs.stat(owned)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
