import type { ThemeTransitionDirection, ThemeTransitionPreset } from './presets'
import type {
  AnimationTarget,
  DocumentWithViewTransition,
  FallbackCoordinatesResolver,
  Logger,
  ToggleEventLike,
  ToggleThemeCapabilities,
  ToggleThemeEnvironment,
} from './utils/types'
import { createThemeTransitionPreset } from './presets'
import {
  bindViewTransition,
  detectReducedMotion,
  resolveAnimationTarget,
  resolveGlobalDocument,
  resolveGlobalWindow,
  supportsElementAnimate,
} from './utils/environment'
import {
  resolveCoordinates,
  resolveViewport,
} from './utils/geometry'
import { invokeMaybePromise } from './utils/promise'

export type { ThemeTransitionPreset } from './presets'
export type { FallbackCoordinatesResolver, ToggleThemeCapabilities, ToggleThemeEnvironment } from './utils/types'

export interface UseToggleThemeOptions {
  /**
   * 切换暗色状态：isDark.value = !isDark.value
   */
  toggle?: () => void | Promise<void>
  /**
   * 当前暗色状态：isDark.value
   */
  isCurrentDark?: () => boolean
  viewTransition?: {
    before?: () => void | Promise<void>
    /**
     * 在下一帧执行：await nextTick()
     */
    after?: () => void | Promise<void>
    callback?: () => void | Promise<void>
  }
  duration?: number

  easing?: string
  /**
   * 内置动画预设，默认使用 circle。
   */
  preset?: ThemeTransitionPreset
  document?: DocumentWithViewTransition
  window?: Window & typeof globalThis
  animationTarget?: AnimationTarget
  fallbackCoordinates?: FallbackCoordinatesResolver
  logger?: Logger
}

export interface UseToggleThemeResult {
  toggleTheme: (event?: ToggleEventLike) => Promise<void>
  isAppearanceTransition: boolean
  capabilities: ToggleThemeCapabilities
  environment: ToggleThemeEnvironment
}

type ThemeTransitionStyleDeclaration = Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>

const themeTransitionAttribute = 'data-theme-transition'
const themeTransitionPresetAttribute = 'data-theme-transition-preset'
const themeTransitionCustomProperties = [
  '--theme-transition-x',
  '--theme-transition-y',
  '--theme-transition-radius',
] as const

function getStyleDeclaration(target: Element | null) {
  const style = (target as { style?: unknown } | null)?.style
  if (!style || typeof style !== 'object') {
    return undefined
  }

  const maybeStyle = style as Partial<ThemeTransitionStyleDeclaration>
  return typeof maybeStyle.setProperty === 'function' && typeof maybeStyle.removeProperty === 'function'
    ? maybeStyle as ThemeTransitionStyleDeclaration
    : undefined
}

function applyTransitionState(
  target: Element | null,
  direction: ThemeTransitionDirection,
  x: number,
  y: number,
  endRadius: number,
  preset: ThemeTransitionPreset,
) {
  const style = getStyleDeclaration(target)

  target?.setAttribute?.(themeTransitionAttribute, direction)
  target?.setAttribute?.(themeTransitionPresetAttribute, preset)
  style?.setProperty('--theme-transition-x', `${x}px`)
  style?.setProperty('--theme-transition-y', `${y}px`)
  style?.setProperty('--theme-transition-radius', `${endRadius}px`)

  return () => {
    target?.removeAttribute?.(themeTransitionAttribute)
    target?.removeAttribute?.(themeTransitionPresetAttribute)
    for (const property of themeTransitionCustomProperties) {
      style?.removeProperty(property)
    }
  }
}

export function useToggleTheme(options: UseToggleThemeOptions): UseToggleThemeResult {
  const {
    toggle,
    viewTransition,
    isCurrentDark,
    duration,
    easing,
    preset = 'circle',
    document: documentLike,
    window: windowLike,
    animationTarget,
    fallbackCoordinates,
    logger = console,
  } = { ...options }

  const resolvedDocument = resolveGlobalDocument(documentLike)
  const resolvedWindow = resolveGlobalWindow(windowLike)
  const target = resolveAnimationTarget(animationTarget, resolvedDocument)

  const startViewTransition = bindViewTransition(resolvedDocument)
  const prefersReducedMotion = detectReducedMotion(resolvedWindow)
  const supportsAnimate = supportsElementAnimate(target)
  const hasViewTransition = Boolean(startViewTransition)
  const isAppearanceTransition = Boolean(hasViewTransition && !prefersReducedMotion && supportsAnimate)
  const capabilities: ToggleThemeCapabilities = {
    hasViewTransition,
    prefersReducedMotion,
    supportsAnimate,
  }
  const environment: ToggleThemeEnvironment = {
    document: resolvedDocument,
    window: resolvedWindow,
    target,
  }

  async function runTransitionWork() {
    if (viewTransition?.callback) {
      await invokeMaybePromise(viewTransition.callback)
      return
    }
    await invokeMaybePromise(viewTransition?.before)
    await invokeMaybePromise(toggle)
    await invokeMaybePromise(viewTransition?.after)
  }

  async function runWithoutViewTransition() {
    if (viewTransition?.callback) {
      await invokeMaybePromise(viewTransition.callback)
      return
    }
    await invokeMaybePromise(toggle)
  }

  async function toggleTheme(event?: ToggleEventLike) {
    if (!isAppearanceTransition || !environment.target) {
      await runWithoutViewTransition()
      return
    }

    const viewport = resolveViewport(environment.window, environment.target)
    const coordinates = resolveCoordinates(event, fallbackCoordinates, viewport, environment.target)

    if (!coordinates) {
      await runWithoutViewTransition()
      return
    }

    const { x, y } = coordinates
    const endRadius = Math.hypot(
      Math.max(x, viewport.viewportWidth - x),
      Math.max(y, viewport.viewportHeight - y),
    )
    let transitionWorkExecuted = false
    let animation: Animation | undefined
    let cleanupTransitionState: (() => void) | undefined
    try {
      const isDark = Boolean(isCurrentDark?.())
      const direction: ThemeTransitionDirection = isDark ? 'from-dark' : 'to-dark'
      const presetDefinition = createThemeTransitionPreset(preset, {
        direction,
        endRadius,
        x,
        y,
      })
      cleanupTransitionState = applyTransitionState(
        environment.target,
        direction,
        x,
        y,
        endRadius,
        preset,
      )
      const transition = startViewTransition!(async () => {
        transitionWorkExecuted = true
        await runTransitionWork()
      })

      await transition.ready

      animation = environment.target.animate?.(
        presetDefinition.keyframes,
        {
          duration: duration ?? presetDefinition.duration,
          easing: easing ?? presetDefinition.easing,
          fill: 'forwards',
          pseudoElement: isDark
            ? '::view-transition-old(root)'
            : '::view-transition-new(root)',
        },
      )

      await animation?.finished.catch(() => {})
      await transition.finished.catch(() => {})
    }
    catch (error) {
      logger?.warn?.('[theme-transition] Falling back to simple toggle because view transition failed.', error)
      if (!transitionWorkExecuted) {
        await runWithoutViewTransition()
      }
    }
    finally {
      try {
        animation?.cancel()
      }
      catch (error) {
        logger?.warn?.('[theme-transition] Failed to release theme transition animation.', error)
      }
      cleanupTransitionState?.()
    }
  }
  return {
    toggleTheme,
    isAppearanceTransition,
    capabilities,
    environment,
  }
}
// 参考实现：https://github.com/antfu-collective/icones/blob/0869721765eeae895cc583b3a2d07fc4a35d70c8/src/components/DarkSwitcher.vue#L27
