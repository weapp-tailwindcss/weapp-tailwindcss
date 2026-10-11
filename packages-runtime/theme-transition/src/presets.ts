import { createClipPathKeyframes } from './utils/geometry'

export type ThemeTransitionPreset = 'circle' | 'fade' | 'wipe' | 'slide'

export type ThemeTransitionDirection = 'to-dark' | 'from-dark'

export interface ThemeTransitionPresetContext {
  direction: ThemeTransitionDirection
  endRadius: number
  x: number
  y: number
}

export interface ThemeTransitionPresetDefinition {
  duration: number
  easing: string
  keyframes: PropertyIndexedKeyframes
}

const circleTiming = {
  duration: 400,
  easing: 'ease-in',
}

const fadeTiming = {
  duration: 240,
  easing: 'ease-in-out',
}

const wipeTiming = {
  duration: 320,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
}

const slideTiming = {
  duration: 280,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
}

export function createThemeTransitionPreset(
  preset: ThemeTransitionPreset,
  context: ThemeTransitionPresetContext,
): ThemeTransitionPresetDefinition {
  const { direction, endRadius, x, y } = context
  const isFromDark = direction === 'from-dark'

  if (preset === 'fade') {
    return {
      ...fadeTiming,
      keyframes: {
        opacity: isFromDark ? [1, 0] : [0, 1],
      },
    }
  }

  if (preset === 'wipe') {
    const clipPath = [
      'inset(0 0 0 100%)',
      'inset(0 0 0 0)',
    ]
    return {
      ...wipeTiming,
      keyframes: {
        clipPath: isFromDark ? [...clipPath].reverse() : clipPath,
      },
    }
  }

  if (preset === 'slide') {
    return {
      ...slideTiming,
      keyframes: {
        opacity: isFromDark ? [1, 0] : [0, 1],
        transform: isFromDark
          ? ['translate3d(0, 0, 0)', 'translate3d(-16px, 0, 0)']
          : ['translate3d(16px, 0, 0)', 'translate3d(0, 0, 0)'],
      },
    }
  }

  const { clipPath, reverseClipPath } = createClipPathKeyframes({ endRadius, x, y })
  return {
    ...circleTiming,
    keyframes: {
      clipPath: isFromDark ? reverseClipPath : clipPath,
    },
  }
}
