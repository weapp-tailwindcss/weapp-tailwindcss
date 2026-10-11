import { describe, expect, it, vi } from 'vitest'
import {
  bindViewTransition,
  detectReducedMotion,
  resolveAnimationTarget,
  resolveGlobalDocument,
  resolveGlobalWindow,
  supportsElementAnimate,
} from '@/utils/environment'
import {
  createClipPathKeyframes,
  resolveCoordinates,
  resolveViewport,
} from '@/utils/geometry'

describe('environment utilities', () => {
  const element = { animate: () => {} } as unknown as Element
  const documentLike = { documentElement: element } as any

  it('resolves globals and animation targets', () => {
    expect(resolveGlobalDocument(documentLike)).toBe(documentLike)
    const customWindow = {} as any
    expect(resolveGlobalWindow(customWindow)).toBe(customWindow)
    expect(resolveGlobalWindow(undefined)).toBeDefined()
    expect(resolveAnimationTarget(() => element, documentLike)).toBe(element)
    expect(resolveAnimationTarget(element, documentLike)).toBe(element)
    expect(resolveAnimationTarget(undefined, documentLike)).toBe(element)
  })

  it('falls back to global objects when no overrides are provided', () => {
    expect(resolveGlobalDocument()).toBeInstanceOf(Document)
    expect(resolveGlobalWindow()).toBe(window)
    expect(resolveAnimationTarget(() => null, { documentElement: null } as any)).toBeNull()
    expect(resolveAnimationTarget(undefined, undefined)).toBeNull()
  })

  it('checks environment capabilities', () => {
    const bound = bindViewTransition({
      startViewTransition: function start() {
        return null
      },
    } as any)
    expect(typeof bound).toBe('function')
    expect(detectReducedMotion({ matchMedia: () => ({ matches: true }) } as any)).toBe(true)
    expect(supportsElementAnimate(null)).toBe(false)
    expect(supportsElementAnimate(element)).toBe(true)
  })
})

describe('geometry utilities', () => {
  const target = {
    getBoundingClientRect: () => ({ width: 50, height: 40 }),
  } as any

  it('resolves viewport dimensions even without window sizes', () => {
    const viewport = resolveViewport(undefined, target)
    expect(viewport).toEqual({ viewportWidth: 50, viewportHeight: 40 })
  })

  it('resolves coordinates from events, fallbacks and objects', () => {
    const viewport = { viewportWidth: 50, viewportHeight: 40 }
    expect(resolveCoordinates({ clientX: 1, clientY: 2 } as any, undefined, viewport, null)).toEqual({ x: 1, y: 2 })

    const fromFunction = resolveCoordinates(
      undefined,
      ({ viewportWidth, viewportHeight }) => ({ x: viewportWidth / 2, y: viewportHeight / 2 }),
      viewport,
      target,
    )
    expect(fromFunction).toEqual({ x: 25, y: 20 })

    expect(resolveCoordinates(undefined, { x: 5, y: 6 }, viewport, target)).toEqual({ x: 5, y: 6 })
    expect(resolveCoordinates(undefined, { x: 5, y: Number.POSITIVE_INFINITY }, viewport, target)).toBeNull()
  })

  it('treats exact zero coordinates as pointerless while preserving viewport edge clicks', () => {
    const viewport = { viewportWidth: 50, viewportHeight: 40 }
    const fallback = vi.fn(() => ({ x: 25, y: 20 }))

    expect(resolveCoordinates({ clientX: 0, clientY: 0 }, fallback, viewport, target)).toBeNull()
    expect(fallback).not.toHaveBeenCalled()
    expect(resolveCoordinates({ clientX: 0, clientY: 20 }, undefined, viewport, target)).toEqual({ x: 0, y: 20 })
    expect(resolveCoordinates({ clientX: 25, clientY: 0 }, undefined, viewport, target)).toEqual({ x: 25, y: 0 })
  })

  it('creates reversible clip-path keyframes', () => {
    const { clipPath, reverseClipPath } = createClipPathKeyframes({ x: 10, y: 20, endRadius: 30 })
    expect(clipPath).toEqual(['circle(0px at 10px 20px)', 'circle(30px at 10px 20px)'])
    expect(reverseClipPath).toEqual(clipPath.toReversed())
  })

  it('reflects viewport dimensions from innerWidth/innerHeight when provided', () => {
    const viewport = resolveViewport({ innerWidth: 10, innerHeight: 20 } as any, null)
    expect(viewport).toEqual({ viewportWidth: 10, viewportHeight: 20 })
  })

  it('returns null when fallback resolver yields invalid coordinates', () => {
    const viewport = { viewportWidth: 0, viewportHeight: 0 }
    expect(resolveCoordinates(undefined, () => ({ x: Number.POSITIVE_INFINITY, y: 1 }), viewport, null)).toBeNull()
  })

  it('returns zeroed viewport when no dimensions are available', () => {
    const viewport = resolveViewport(undefined, null)
    expect(viewport).toEqual({ viewportWidth: 0, viewportHeight: 0 })
  })

  it('handles missing global document/window gracefully', () => {
    const originalDocument = (globalThis as any).document
    const originalWindow = (globalThis as any).window
    // @ts-expect-error testing missing globals
    delete (globalThis as any).document
    // @ts-expect-error testing missing globals
    delete (globalThis as any).window

    try {
      expect(resolveGlobalDocument()).toBeUndefined()
      expect(resolveGlobalWindow()).toBeUndefined()
    }
    finally {
      if (originalDocument) {
        (globalThis as any).document = originalDocument
      }
      if (originalWindow) {
        (globalThis as any).window = originalWindow
      }
    }
  })
})
