import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { writeReport } from '../scripts/demo-visual-e2e-report/report'

it('原生热重载单独报告，不计入纯 HMR 步数', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-update-mode-'))
  try {
    await writeReport([{
      name: 'native-example',
      platform: 'app-ios',
      status: 'passed',
      updateMode: 'native-reload',
      hmrSteps: [{
        name: 'update',
        marker: 'current-marker',
        classLiteral: 'bg-red-500',
        expectedBackgroundColor: '#ef4444',
        afterScreenshot: path.join(directory, 'after.png'),
        evidence: { updateLifecycle: { mode: 'native-reload', state: 'restarted', appLaunchCount: 1 } },
      }],
    }], { artifactRoot: directory, repoRoot: directory, timeoutMs: 1000, viewport: { width: 375, height: 667 } })
    const markdown = await fs.readFile(path.join(directory, 'report.md'), 'utf8')
    expect(markdown).toContain('- HMR visual steps: 0')
    expect(markdown).toContain('- Native reload visual steps: 1')
    expect(markdown).toContain('| passed | native-reload |')
    const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8'))
    expect(report.results[0].hmrSteps[0].evidence.updateLifecycle.appLaunchCount).toBe(1)
  }
  finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
