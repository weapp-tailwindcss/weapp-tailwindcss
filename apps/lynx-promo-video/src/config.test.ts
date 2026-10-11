import { describe, expect, it } from 'vitest'
import { getPromoCopy, promoCopies, sceneAtFrame, scenes, VIDEO } from './config'

describe('promo timeline', () => {
  it('fills the complete composition without gaps or overlap', () => {
    expect(scenes[0].from).toBe(0)
    for (let index = 1; index < scenes.length; index += 1) {
      expect(scenes[index].from).toBe(scenes[index - 1].from + scenes[index - 1].duration)
    }
    const last = scenes.at(-1)
    expect(last && last.from + last.duration).toBe(VIDEO.durationInFrames)
  })

  it('resolves every boundary frame', () => {
    expect(sceneAtFrame(0)?.id).toBe('hook')
    expect(sceneAtFrame(149)?.id).toBe('hook')
    expect(sceneAtFrame(150)?.id).toBe('config')
    expect(sceneAtFrame(1799)?.id).toBe('cta')
  })

  it('keeps both locale copy sets complete and aligned', () => {
    for (const locale of ['zh', 'en'] as const) {
      expect(Object.keys(promoCopies[locale].narration)).toHaveLength(scenes.length)
      expect(promoCopies[locale].docsUrl).toContain('tw.weapp.dev')
    }
    expect(sceneAtFrame(150, 'en')?.subtitle).toBe(getPromoCopy('en').narration.config)
    expect(sceneAtFrame(150, 'zh')?.subtitle).toBe(getPromoCopy('zh').narration.config)
  })

  it('keeps English natural-language copy free of Chinese characters', () => {
    const english = JSON.stringify(promoCopies.en)
    expect(english).not.toMatch(/[\u3400-\u9FFF]/u)
  })
})
