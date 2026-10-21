import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { saveGeneratorEvidence } from './apps-generator-evidence'

it('原始资产字节与正规化快照分别保存且分别绑定 hash', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'generator-evidence-'))
  let directory: string | undefined
  try {
    const expectedPath = path.join(temporary, 'expected.md')
    await writeFile(expectedPath, 'expected')
    const raw = Buffer.from('\uFEFF:root{--color-cyan-500:#06b6d4}\r\n/* 作者 */')
    directory = await saveGeneratorEvidence({
      name: 'evidence-regression',
      platform: 'web',
      expectedPath,
      report: 'normalized report',
      files: [{ fileName: 'index.css', content: ':root {}' }],
      rawFiles: [{ fileName: '../原始/index.123.css', content: raw }],
    })
    const identity = JSON.parse(await readFile(path.join(directory, 'identity.json'), 'utf8'))
    expect(identity.status).toBe('generated-unverified')
    expect(identity.files[0].representation).toBe('normalized-snapshot')
    expect(await readFile(path.join(directory, identity.files[0].artifact), 'utf8')).toBe(':root {}')
    expect(identity.rawFiles[0].representation).toBe('bundle-asset-bytes')
    expect(identity.rawFiles[0].sha256).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(await readFile(path.join(directory, identity.rawFiles[0].artifact))).toEqual(raw)
  }
  finally {
    await rm(temporary, { recursive: true, force: true })
    if (directory) {
      await rm(directory, { recursive: true, force: true })
    }
  }
})
