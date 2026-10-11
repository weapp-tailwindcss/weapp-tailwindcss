import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { getManifestPathsForProjectRoot } from '../packages/react-native/src/metro'
import { captureMetroEvidence } from './react-native/metro-evidence'

it('保留还原前的 CSS、manifest 与发布错误，不把诊断缺失当作稳定发布', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-evidence-'))
  const { manifestPath, manifestReadyPath } = getManifestPathsForProjectRoot(root)
  const css = path.join(root, 'global.css')
  const output = path.join(root, 'evidence')
  try {
    const input = '.probe { background-color: #f59e0b }'
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(css, input)
    await fs.writeFile(manifestPath, '{"rules":{}}')
    await captureMetroEvidence(root, output, { 'global.css': css, 'missing.ts': path.join(root, 'missing.ts') })
    await fs.writeFile(css, 'restored source')
    expect(await fs.readFile(path.join(output, 'global.css'), 'utf8')).toBe(input)
    expect(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')).toBe('{"rules":{}}')
    const snapshot = JSON.parse(await fs.readFile(path.join(output, 'snapshot.json'), 'utf8'))
    expect(snapshot.stablePublication).toBe(false)
    expect(snapshot.files['manifest.ready'].error).toContain('ENOENT')
    expect(snapshot.files['missing.ts'].error).toContain('ENOENT')
    expect(snapshot.files['global.css'].sha256).toBe(createHash('sha256').update(input).digest('hex'))
    await fs.writeFile(manifestReadyPath, '{"error":"invalid CSS"}')
    await captureMetroEvidence(root, path.join(root, 'failed'), { 'global.css': css })
    expect(await fs.readFile(path.join(root, 'failed', 'manifest.ready'), 'utf8')).toContain('invalid CSS')
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(manifestPath, { force: true })
    await fs.rm(manifestReadyPath, { force: true })
  }
})
