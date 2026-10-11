import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSourceScanPath } from '@/tailwindcss/source-scan'

describe('source scan path identity', () => {
  it('keeps deleted files and directories canonical under a linked workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-source-identity-'))
    try {
      const sourceRoot = path.join(root, 'real workspace')
      const linkRoot = path.join(root, 'linked workspace')
      const source = path.join(sourceRoot, 'nested', 'views', 'card.axml')
      const linked = path.join(linkRoot, 'nested', 'views', 'card.axml')
      await mkdir(path.dirname(source), { recursive: true })
      await writeFile(source, '<view class="h-8" />')
      await symlink(sourceRoot, linkRoot, 'junction')
      const canonical = await realpath(source)
      expect(resolveSourceScanPath(linked)).toBe(canonical)
      await rm(path.join(sourceRoot, 'nested'), { recursive: true })
      expect(resolveSourceScanPath(linked)).toBe(canonical)
      expect(resolveSourceScanPath(path.relative(process.cwd(), linked))).toBe(canonical)
      await mkdir(path.dirname(source), { recursive: true })
      await writeFile(source, '<view class="h-20" />')
      expect(resolveSourceScanPath(linked)).toBe(canonical)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
