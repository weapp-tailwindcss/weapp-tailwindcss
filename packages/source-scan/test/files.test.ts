import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createSourceScanPlan, expandSourceEntries, resolveSourceScanPath } from '../src'

describe('扫描策略与路径身份', () => {
  it('禁用自动扫描保留显式来源，纯排除规则不启动枚举', async () => {
    const entries = [{ base: '/project', pattern: '**/*.qxml', negated: false }]
    expect(createSourceScanPlan({ base: '/project', mode: 'disabled', entries })).toEqual(entries)
    expect(createSourceScanPlan({ base: '/project', mode: 'explicit' })).toEqual([])
    const enumerate = vi.fn(async () => ['/project/unrelated.qxml'])
    expect(await expandSourceEntries([{ ...entries[0]!, negated: true }], enumerate)).toEqual([])
    expect(enumerate).not.toHaveBeenCalled()
  })
  it('符号链接中的文件删除和重建保持路径身份', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-identity-'))
    try {
      const real = path.join(root, 'real')
      const alias = path.join(root, 'alias')
      await fs.mkdir(real)
      await fs.symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir')
      const file = path.join(real, 'page.qxml')
      await fs.writeFile(file, 'flex')
      const identity = resolveSourceScanPath(path.join(alias, 'page.qxml'))
      expect(identity).toBe(resolveSourceScanPath(file))
      await fs.rm(file)
      expect(resolveSourceScanPath(path.join(alias, 'page.qxml'))).toBe(identity)
      await fs.writeFile(file, 'grid')
      expect(resolveSourceScanPath(path.join(alias, 'page.qxml'))).toBe(identity)
    }
    finally { await fs.rm(root, { recursive: true, force: true }) }
  })
})
