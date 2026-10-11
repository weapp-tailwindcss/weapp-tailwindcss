import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect } from 'vitest'
import {
  DEFAULT_VSCODE_ENTRY_OUTPUT,
  DEFAULT_VSCODE_SOURCES,
  generateVscodeIntellisenseEntry,
} from '@/vscode-entry'

const TMP_PREFIX = 'weapp-tw-vscode'

async function createTempWorkspace() {
  return await mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
}

describe('generateVscodeIntellisenseEntry', () => {
  it('creates helper with defaults', async () => {
    const root = await createTempWorkspace()
    const cssEntry = path.join(root, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss";\n', 'utf8')

    const result = await generateVscodeIntellisenseEntry({ baseDir: root, cssEntry })

    // Windows 下 path.relative 返回反斜杠，需统一为平台原生格式比较
    expect(path.relative(root, result.outputPath)).toBe(path.normalize(DEFAULT_VSCODE_ENTRY_OUTPUT))
    const content = await readFile(result.outputPath, 'utf8')
    expect(content).toContain('@import \'tailwindcss\';')
    expect(content).toContain('@import \'../src/app.css\';')
    expect(content).toContain('@source not "./dist";')
    expect(DEFAULT_VSCODE_SOURCES).toContain('./src/**/*.{vue,svelte,mpx,html,md,mdx}')
    expect(content).toContain('@source "./src/**/*.{vue,svelte,mpx,html,md,mdx}";')
    expect(content).toContain('@source "./src/**/*.{js,jsx,ts,tsx,mjs,cjs,wxs,sjs}";')
  })

  it('supports custom output, sources and force overwrite', async () => {
    const root = await createTempWorkspace()
    const cssEntry = path.join(root, 'styles/global.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss";\n', 'utf8')

    const output = path.join(root, 'tailwindcss.vscode.css')
    const first = await generateVscodeIntellisenseEntry({
      baseDir: root,
      cssEntry,
      output,
      sources: ['./custom/**/*.{wxml,wxss}', 'not ./build'],
    })

    expect(first.outputPath).toBe(output)

    const content = await readFile(output, 'utf8')
    expect(content).toContain('@source "./custom/**/*.{wxml,wxss}";')
    expect(content).toContain('@source not "./build";')

    await expect(
      generateVscodeIntellisenseEntry({ baseDir: root, cssEntry, output }),
    ).rejects.toThrow(/already exists/i)

    await generateVscodeIntellisenseEntry({
      baseDir: root,
      cssEntry,
      output,
      force: true,
      sources: ['./custom/**/*.{wxml,wxss}'],
    })
  })
})
