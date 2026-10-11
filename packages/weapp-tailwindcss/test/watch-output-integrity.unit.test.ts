import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectEmptyCssBlocks } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/css-integrity'
import { createOutputIntegrityMonitor } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/output-integrity'

const createdDirs: string[] = []

describe('watch output integrity monitor', () => {
  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('records an invalid intermediate output even when the final file is corrected', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-output-integrity-'))
    createdDirs.push(root)
    const outputFile = path.join(root, 'HelloWorld.wxss')
    const monitor = createOutputIntegrityMonitor([{
      file: outputFile,
      forbiddenFragments: ['.i-\\['],
    }])!

    await writeFile(outputFile, '.i-\\[mdi--github-circle\\]{display:inline-block}', 'utf8')
    await new Promise(resolve => setTimeout(resolve, 40))
    await writeFile(outputFile, '.i-_bmdi--github-circle_B{display:inline-block}', 'utf8')

    await expect(monitor.assertClean('test update')).rejects.toThrow('output integrity violation')
    await monitor.stop()
  })

  it('records empty conditional at-rules in final style outputs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-empty-at-rule-integrity-'))
    createdDirs.push(root)
    const outputDirectory = path.join(root, 'dist')
    const outputFile = path.join(outputDirectory, 'pages/index/index.wxss')
    await mkdir(path.dirname(outputFile), { recursive: true })
    await writeFile(outputFile, '@media (prefers-color-scheme: dark) { /* removed declarations */ }\n.keep{color:red}', 'utf8')
    const monitor = createOutputIntegrityMonitor([{
      directory: outputDirectory,
      forbidEmptyBlockAtRules: true,
    }])!

    await expect(monitor.assertClean('incremental finalization')).rejects.toThrow('@media (prefers-color-scheme: dark)')
    await monitor.stop()
  })

  it('collects empty selector rules and block at-rules', () => {
    const source = [
      ':is(page,.tw-root,wx-root-portal-content){}',
      '.comment-only{/* declarations removed */}',
      '@media print{/* declarations removed */}',
      '@keyframes spin{0%{}to{transform:rotate(1turn)}}',
      '.keep{color:red}',
    ].join('\n')

    expect(collectEmptyCssBlocks(source)).toEqual([
      ':is(page,.tw-root,wx-root-portal-content){}',
      '.comment-only{/* declarations removed */}',
      '@media print{/* declarations removed */}',
    ])
  })
})
