import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { collectH5ThemeEvidence } from '../scripts/demo-visual-e2e-report/theme'

function createPage(manualBackground = 'rgb(52, 152, 219)', rootBackground = 'rgb(9, 9, 11)', manualText = 'rgb(250, 250, 250)') {
  const evidence = {
    found: true,
    light: { backgroundColor: 'rgb(255, 255, 255)' },
    rootManualDark: { backgroundColor: rootBackground, color: 'rgb(250, 250, 250)' },
    manualDark: { found: true, backgroundColor: manualBackground, color: manualText },
  }
  return { evaluate: vi.fn().mockResolvedValue(evidence) } as unknown as Page
}

describe('H5 theme expectations', () => {
  const expectation = { backgroundColor: [52, 152, 219] as [number, number, number] }

  it('checks the configured manual theme color instead of assuming black', async () => {
    await expect(collectH5ThemeEvidence(createPage(), expectation)).resolves.toMatchObject({
      manualDark: { backgroundColor: 'rgb(52, 152, 219)' },
    })
    await expect(collectH5ThemeEvidence(createPage('rgb(236, 204, 104)'), expectation)).rejects.toThrow('手动暗色')
  })

  it('still requires a dark root and light text when the manual color is configured', async () => {
    await expect(collectH5ThemeEvidence(createPage(undefined, 'rgb(255, 255, 255)'), expectation)).rejects.toThrow('根示例')
    await expect(collectH5ThemeEvidence(createPage(undefined, undefined, 'rgb(0, 0, 0)'), expectation)).rejects.toThrow('手动暗色')
  })

  it('preserves the default dark manual theme assertion', async () => {
    await expect(collectH5ThemeEvidence(createPage('rgb(9, 9, 11)'))).resolves.toBeDefined()
    await expect(collectH5ThemeEvidence(createPage())).rejects.toThrow('手动暗色')
  })
})
