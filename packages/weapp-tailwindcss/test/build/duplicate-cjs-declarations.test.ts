import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const script = path.join(repoRoot, 'tools/weapp-tailwindcss-scripts/src/duplicate-cjs-declarations.ts')

it('递归生成 CJS 声明并把内部引用绑定到同格式声明图，保留 ESM 原文', async () => {
  const root = await mkdtemp(path.join(tmpdir(), '双格式声明 '))
  const original = [
    "export * from './nested/value.js'",
    "export * from './nested'",
    "type Lazy = import('./nested/value.js').Value",
    "export type { External } from 'external-package'",
  ].join('\n')
  try {
    await mkdir(path.join(root, 'dist/nested'), { recursive: true })
    await writeFile(path.join(root, 'dist/index.d.ts'), original)
    await writeFile(path.join(root, 'dist/nested/index.d.ts'), "export * from './value.js'")
    await writeFile(path.join(root, 'dist/nested/value.d.ts'), 'export type Value = string')
    execFileSync(process.execPath, ['--import', 'tsx', script, root], { cwd: repoRoot })
    expect(await readFile(path.join(root, 'dist/index.d.ts'), 'utf8')).toBe(original)
    expect(await readFile(path.join(root, 'dist/index.d.cts'), 'utf8')).toBe([
      "export * from './nested/value.cjs'",
      "export * from './nested/index.cjs'",
      "type Lazy = import('./nested/value.cjs').Value",
      "export type { External } from 'external-package'",
    ].join('\n'))
    expect(await readFile(path.join(root, 'dist/nested/index.d.cts'), 'utf8')).toBe("export * from './value.cjs'")
    expect(await readFile(path.join(root, 'dist/nested/value.d.cts'), 'utf8')).toBe('export type Value = string')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
