import { describe, expect, it, vi } from 'vitest'
import { generateNativeStylesheet } from '../src/tailwind'
import { generateNativeStylesheetEvidence } from '../src/tailwind/generate'

const generated = vi.hoisted(() => ({ generate: vi.fn(), dispose: vi.fn() }))
vi.mock('weapp-tailwindcss/generator', () => ({
  resolveTailwindV4Source: async () => ({ projectRoot: 'project' }),
  createWeappTailwindcssGenerator: () => generated,
}))

function output() {
  return {
    rawCss: '.valid { color: #fff } .filter { filter: blur(2px) }',
    classSet: new Set(['valid', 'filter']), rawCandidates: new Set(['valid', 'filter']),
  }
}

describe('原生生成与编码分层', () => {
  it('原生拒绝编码的 class 仍保留 Tailwind 原始生成证据', async () => {
    generated.generate.mockResolvedValueOnce(output())
    const result = await generateNativeStylesheetEvidence()
    expect(result.generatedClassSet).toEqual(['valid', 'filter'])
    expect(result.manifest.classSet).toEqual(['valid'])
    expect(result.rawCss).toContain('filter: blur(2px)')
    expect(result.manifest.warnings).toEqual([expect.objectContaining({ className: 'filter', property: 'filter' })])
    expect(generated.dispose).toHaveBeenCalled()
  })

  it('既有公开 API 继续仅返回 manifest', async () => {
    generated.generate.mockResolvedValueOnce(output())
    const manifest = await generateNativeStylesheet()
    expect(manifest.classSet).toEqual(['valid'])
    expect(manifest).not.toHaveProperty('rawCss')
  })

  it('生成失败仍释放本轮 generator，不留下旧结果', async () => {
    generated.dispose.mockClear()
    const error = new Error('generation failed')
    generated.generate.mockRejectedValueOnce(error)
    await expect(generateNativeStylesheetEvidence()).rejects.toBe(error)
    expect(generated.dispose).toHaveBeenCalledOnce()
  })
})
