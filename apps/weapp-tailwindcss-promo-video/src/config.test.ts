import { describe, expect, it } from 'vitest'
import { wrapCaption } from '../scripts/audio/subtitles'
import { compositionId, films, FORMATS, FPS, getFormat, getLocale, LOCALES, sceneAtFrame } from './config'
import { copy } from './content/copy'
import { scriptFor } from './content/narration'

describe('双语独立剪辑', () => {
  for (const locale of LOCALES) {
    for (const format of FORMATS) {
      it(`${locale}/${format} 完整覆盖且文案可读`, () => {
        const film = films[format]
        expect(film.width / film.height).toBeCloseTo(format === 'landscape' ? 16 / 9 : 9 / 16)
        expect(film.seconds).toBe(format === 'landscape' ? 60 : 30)
        for (let frame = 0; frame < film.seconds * FPS; frame++) {
          expect(film.scenes.filter(scene => frame >= scene.from * FPS && frame < (scene.from + scene.duration) * FPS)).toHaveLength(1)
          expect(sceneAtFrame(format, frame)).toBeDefined()
        }
        expect(film.scenes.at(-1)?.id).toBe('cta')
        expect(film.scenes.at(-1)?.duration).toBeGreaterThanOrEqual(4)
        expect(sceneAtFrame(format, film.seconds * FPS)).toBeUndefined()
        for (const scene of film.scenes) {
          const script = scriptFor(locale, format, scene.id)
          expect(script.captions.length).toBeGreaterThan(0)
          expect(copy[locale].heading[scene.id]).toHaveLength(2)
          for (const caption of script.captions) {
            expect(wrapCaption(caption, locale).split('\n').length).toBeLessThanOrEqual(2)
          }
        }
      })
    }
  }
  it('组合身份唯一，旧中文 composition 保持可用', () => {
    const ids = LOCALES.flatMap(locale => FORMATS.map(format => compositionId(format, locale)))
    expect(new Set(ids).size).toBe(4)
    expect(compositionId('landscape', 'zh')).toBe('WeappPromoLandscape')
    expect(compositionId('portrait', 'en')).toBe('WeappPromoPortraitEn')
    expect(films.portrait.scenes.map(scene => scene.id)).not.toContain('tools')
    expect(() => getFormat('square')).toThrow()
    expect(() => getLocale('fr')).toThrow()
  })
  it('英文文案不残留中文', () => {
    expect(JSON.stringify(copy.en)).not.toMatch(/\p{Script=Han}/u)
  })
})
