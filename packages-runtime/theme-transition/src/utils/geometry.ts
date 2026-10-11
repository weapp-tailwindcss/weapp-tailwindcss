import type {
  FallbackCoordinatesResolver,
  ToggleCoordinates,
  ToggleEventLike,
  ViewportDimensions,
} from './types'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function resolveViewport(
  windowLike: (Window & typeof globalThis) | undefined,
  animationTarget: Element | null,
): ViewportDimensions {
  const rect = animationTarget?.getBoundingClientRect?.()
  const viewportWidth = isFiniteNumber(windowLike?.innerWidth)
    ? windowLike!.innerWidth
    : rect?.width ?? 0
  const viewportHeight = isFiniteNumber(windowLike?.innerHeight)
    ? windowLike!.innerHeight
    : rect?.height ?? 0
  return {
    viewportWidth,
    viewportHeight,
  }
}

export function resolveCoordinates(
  event: ToggleEventLike | undefined,
  fallback: FallbackCoordinatesResolver | undefined,
  viewport: ViewportDimensions,
  target: Element | null,
): ToggleCoordinates | null {
  if (event && isFiniteNumber(event.clientX) && isFiniteNumber(event.clientY)) {
    if (event.clientX === 0 && event.clientY === 0) {
      return null
    }

    return {
      x: event.clientX,
      y: event.clientY,
    }
  }

  if (typeof fallback === 'function') {
    const result = fallback({
      viewportWidth: viewport.viewportWidth,
      viewportHeight: viewport.viewportHeight,
      target,
    })
    if (result && isFiniteNumber(result.x) && isFiniteNumber(result.y)) {
      return result
    }
  }
  else if (fallback && isFiniteNumber(fallback.x) && isFiniteNumber(fallback.y)) {
    return fallback
  }

  return null
}

export function createClipPathKeyframes({ x, y, endRadius }: ToggleCoordinates & { endRadius: number }) {
  const clipPath = [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${endRadius}px at ${x}px ${y}px)`,
  ]
  return {
    clipPath,
    reverseClipPath: [...clipPath].reverse(),
  }
}
