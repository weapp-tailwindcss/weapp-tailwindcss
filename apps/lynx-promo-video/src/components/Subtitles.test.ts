import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import subtitles from '../generated/subtitles.json'
import { Subtitles } from './Subtitles'

const clock = vi.hoisted(() => ({ frame: 0 }))
vi.mock('remotion', () => ({
  useCurrentFrame: () => clock.frame,
  interpolate: () => 1,
}))

describe('burned sentence subtitles', () => {
  it('shows only the current spoken sentence during development', () => {
    const cues = subtitles.en.filter(cue => cue.sceneId === 'classname')
    expect(cues.length).toBeGreaterThan(1)
    clock.frame = cues[1].from + 1
    const markup = renderToStaticMarkup(createElement(Subtitles, { locale: 'en' }))
    expect(markup).toContain(cues[1].text)
    expect(markup).not.toContain(cues[0].text)
  })

  it('hides subtitles before the first cue and after the timeline', () => {
    clock.frame = 0
    expect(renderToStaticMarkup(createElement(Subtitles, { locale: 'zh' }))).toBe('')
    clock.frame = subtitles.zh.at(-1)!.to
    expect(renderToStaticMarkup(createElement(Subtitles, { locale: 'zh' }))).toBe('')
  })
})
