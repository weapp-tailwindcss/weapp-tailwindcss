import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { repo } from './catalog.mjs'

// 升级诊断显式传入独立安装目录；常规 CI 始终使用框架实际解析的版本。
export function rollupTestRequire(demo) {
  const candidate = process.env.WEAPP_TW_ROLLUP_CANDIDATE
  if (candidate && !demo.startsWith('taro-')) {
    assert.ok(path.isAbsolute(candidate), 'Rollup 候选目录必须是绝对路径')
    const require = createRequire(path.join(candidate, 'package.json'))
    assert.equal(require('rollup/package.json').version, '4.63.5', '候选实验必须使用确切版本')
    return require
  }
  const demoRequire = createRequire(path.join(repo, 'demo', demo, 'package.json'))
  return createRequire(demoRequire.resolve('vite/package.json'))
}
