import { createThemeTransitionPreset } from '@/presets'

const context = {
  direction: 'to-dark' as const,
  endRadius: 500,
  x: 100,
  y: 120,
}

describe('theme transition presets', () => {
  it('creates the pointer-based circle preset with its existing defaults', () => {
    expect(createThemeTransitionPreset('circle', context)).toEqual({
      duration: 400,
      easing: 'ease-in',
      keyframes: {
        clipPath: [
          'circle(0px at 100px 120px)',
          'circle(500px at 100px 120px)',
        ],
      },
    })
  })

  it('creates a fade preset', () => {
    expect(createThemeTransitionPreset('fade', context)).toEqual({
      duration: 240,
      easing: 'ease-in-out',
      keyframes: {
        opacity: [0, 1],
      },
    })
  })

  it('creates a right-to-left wipe preset', () => {
    expect(createThemeTransitionPreset('wipe', context)).toEqual({
      duration: 320,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      keyframes: {
        clipPath: [
          'inset(0 0 0 100%)',
          'inset(0 0 0 0)',
        ],
      },
    })
  })

  it('creates a slide and fade preset', () => {
    expect(createThemeTransitionPreset('slide', context)).toEqual({
      duration: 280,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      keyframes: {
        opacity: [0, 1],
        transform: [
          'translate3d(16px, 0, 0)',
          'translate3d(0, 0, 0)',
        ],
      },
    })
  })

  it.each([
    ['circle', { clipPath: ['circle(500px at 100px 120px)', 'circle(0px at 100px 120px)'] }],
    ['fade', { opacity: [1, 0] }],
    ['wipe', { clipPath: ['inset(0 0 0 0)', 'inset(0 0 0 100%)'] }],
    ['slide', {
      opacity: [1, 0],
      transform: ['translate3d(0, 0, 0)', 'translate3d(-16px, 0, 0)'],
    }],
  ] as const)('reverses %s when leaving dark mode', (preset, keyframes) => {
    expect(createThemeTransitionPreset(preset, {
      ...context,
      direction: 'from-dark',
    }).keyframes).toEqual(keyframes)
  })
})
