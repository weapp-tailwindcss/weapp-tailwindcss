import type { Plugin } from 'postcss'
import type { IStyleHandlerOptions } from '@/types'
import postcss from 'postcss'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const { pxMock, remMock, calcMock, unitConverterMock, unitsToPxPresetMock } = vi.hoisted(() => {
  return {
    pxMock: vi.fn(),
    remMock: vi.fn(),
    calcMock: vi.fn(),
    unitConverterMock: vi.fn(),
    unitsToPxPresetMock: vi.fn(),
  }
})

vi.mock('postcss-pxtrans', () => ({ __esModule: true, default: pxMock }))
vi.mock('postcss-rem-to-responsive-pixel', () => ({ __esModule: true, default: remMock }))
vi.mock('@weapp-tailwindcss/postcss-calc', () => ({ __esModule: true, default: calcMock }))
vi.mock('postcss-rule-unit-converter', () => ({
  __esModule: true,
  default: unitConverterMock,
  presets: {
    unitsToPx: unitsToPxPresetMock,
  },
}))

type PxModule = typeof import('@/plugins/getPxTransformPlugin')
type RemModule = typeof import('@/plugins/getRemTransformPlugin')
type CalcModule = typeof import('@/plugins/getCalcPlugin')
type UnitsModule = typeof import('@/plugins/getUnitsToPxPlugin')
type UnitConversionModule = typeof import('@/plugins/getUnitConversionPlugin')
type CleanerModule = typeof import('@/plugins/getCustomPropertyCleaner')

let getPxTransformPlugin: PxModule['getPxTransformPlugin']
let getRemTransformPlugin: RemModule['getRemTransformPlugin']
let getCalcPlugin: CalcModule['getCalcPlugin']
let getCalcDuplicateCleaner: typeof import('@/plugins/getCalcDuplicateCleaner').getCalcDuplicateCleaner
let getUnitsToPxPlugin: UnitsModule['getUnitsToPxPlugin']
let getUnitConversionPlugin: UnitConversionModule['getUnitConversionPlugin']
let getCustomPropertyCleaner: CleanerModule['getCustomPropertyCleaner']

const TW_CUSTOM_PROPERTY_REGEX = /^--tw-/

beforeAll(async () => {
  const pxModule = await import('@/plugins/getPxTransformPlugin')
  getPxTransformPlugin = pxModule.getPxTransformPlugin

  const remModule = await import('@/plugins/getRemTransformPlugin')
  getRemTransformPlugin = remModule.getRemTransformPlugin

  const calcModule = await import('@/plugins/getCalcPlugin')
  getCalcPlugin = calcModule.getCalcPlugin

  const calcDuplicateCleanerModule = await import('@/plugins/getCalcDuplicateCleaner')
  getCalcDuplicateCleaner = calcDuplicateCleanerModule.getCalcDuplicateCleaner

  const unitsModule = await import('@/plugins/getUnitsToPxPlugin')
  getUnitsToPxPlugin = unitsModule.getUnitsToPxPlugin

  const unitConversionModule = await import('@/plugins/getUnitConversionPlugin')
  getUnitConversionPlugin = unitConversionModule.getUnitConversionPlugin

  const cleanerModule = await import('@/plugins/getCustomPropertyCleaner')
  getCustomPropertyCleaner = cleanerModule.getCustomPropertyCleaner
})

function createOptions(partial: Partial<IStyleHandlerOptions> = {}): IStyleHandlerOptions {
  return {
    cssPresetEnv: {
      features: {},
      autoprefixer: { add: false },
    },
    ...partial,
  } as IStyleHandlerOptions
}

afterEach(() => {
  pxMock.mockReset()
  remMock.mockReset()
  calcMock.mockReset()
  unitConverterMock.mockReset()
  unitsToPxPresetMock.mockReset()
})

describe('getPxTransformPlugin', () => {
  it('returns null when px2rpx disabled', () => {
    const plugin = getPxTransformPlugin(createOptions({ px2rpx: false }))
    expect(plugin).toBeNull()
    expect(pxMock).not.toHaveBeenCalled()
  })

  it('merges px2rpx options with defaults', () => {
    pxMock.mockImplementation(options => ({ postcssPlugin: 'mock-px', options }))

    const plugin = getPxTransformPlugin(createOptions({
      px2rpx: {
        designWidth: 1080,
        replace: false,
      },
    })) as Plugin | null

    expect(pxMock).toHaveBeenCalledTimes(1)
    expect(pxMock).toHaveBeenCalledWith(expect.objectContaining({
      designWidth: 1080,
      replace: false,
      platform: 'weapp',
      deviceRatio: expect.objectContaining({ 750: 1 }),
    }))
    expect(plugin?.postcssPlugin).toBe('mock-px')
  })

  it('reuses default px2rpx options when set to true', () => {
    pxMock.mockImplementation(options => ({ postcssPlugin: 'mock-px', options }))

    getPxTransformPlugin(createOptions({ px2rpx: true }))
    getPxTransformPlugin(createOptions({ px2rpx: true }))

    expect(pxMock).toHaveBeenCalledTimes(2)
    expect(pxMock.mock.calls[0]?.[0]).toBe(pxMock.mock.calls[1]?.[0])
    expect(pxMock.mock.calls[0]?.[0]).toMatchObject({
      platform: 'weapp',
      targetUnit: 'rpx',
      designWidth: 750,
    })
  })
})

describe('getRemTransformPlugin', () => {
  it('returns null when rem2rpx disabled', () => {
    const plugin = getRemTransformPlugin(createOptions({ rem2rpx: false }))
    expect(plugin).toBeNull()
    expect(remMock).not.toHaveBeenCalled()
  })

  it('preserves user supplied processor stage', () => {
    remMock.mockImplementation(options => ({ postcssPlugin: 'mock-rem', options }))

    const plugin = getRemTransformPlugin(createOptions({
      rem2rpx: {
        rootValue: 16,
        processorStage: 'Once',
      },
    })) as Plugin | null

    expect(remMock).toHaveBeenCalledTimes(1)
    expect(remMock).toHaveBeenCalledWith(expect.objectContaining({
      rootValue: 16,
      processorStage: 'Once',
    }))
    expect(plugin?.postcssPlugin).toBe('mock-rem')
  })

  it('applies OnceExit processor stage when missing', () => {
    remMock.mockImplementation(options => ({ postcssPlugin: 'mock-rem', options }))

    const plugin = getRemTransformPlugin(createOptions({ rem2rpx: true })) as Plugin | null

    expect(remMock).toHaveBeenCalledTimes(1)
    expect(remMock).toHaveBeenCalledWith(expect.objectContaining({
      processorStage: 'OnceExit',
      transformUnit: 'rpx',
    }))
    expect(plugin?.postcssPlugin).toBe('mock-rem')
  })

  it('reuses default rem2rpx options when set to true', () => {
    remMock.mockImplementation(options => ({ postcssPlugin: 'mock-rem', options }))

    getRemTransformPlugin(createOptions({ rem2rpx: true }))
    getRemTransformPlugin(createOptions({ rem2rpx: true }))

    expect(remMock).toHaveBeenCalledTimes(2)
    expect(remMock.mock.calls[0]?.[0]).toBe(remMock.mock.calls[1]?.[0])
    expect(remMock.mock.calls[0]?.[0]).toMatchObject({
      rootValue: 32,
      transformUnit: 'rpx',
      processorStage: 'OnceExit',
    })
  })
})

describe('getUnitsToPxPlugin', () => {
  it('returns null when unitsToPx disabled', () => {
    const plugin = getUnitsToPxPlugin(createOptions({ unitsToPx: false }))
    expect(plugin).toBeNull()
    expect(unitConverterMock).not.toHaveBeenCalled()
  })

  it('maps options to rule-unit-converter when enabled', () => {
    unitConverterMock.mockImplementation(options => ({ postcssPlugin: 'mock-units', options }))
    unitsToPxPresetMock.mockReturnValue([
      { from: 'rem', factor: 10, to: 'px' },
      { from: 'em', factor: 16, to: 'px' },
    ])

    const plugin = getUnitsToPxPlugin(createOptions({
      unitsToPx: {
        unitPrecision: 2,
        unitMap: {
          rem: 10,
        },
      },
    })) as Plugin | null

    expect(unitConverterMock).toHaveBeenCalledTimes(1)
    expect(unitsToPxPresetMock).toHaveBeenCalledWith({
      unitMap: {
        rem: 10,
      },
    })
    expect(unitConverterMock).toHaveBeenCalledWith(expect.objectContaining({
      unitPrecision: 2,
      rules: expect.arrayContaining([
        expect.objectContaining({ from: 'rem', factor: 10, to: 'px' }),
        expect.objectContaining({ from: 'em', factor: 16, to: 'px' }),
      ]),
    }))
    expect(plugin?.postcssPlugin).toBe('mock-units')
  })

  it('uses defaults when set to true', () => {
    unitConverterMock.mockImplementation(options => ({ postcssPlugin: 'mock-units', options }))
    unitsToPxPresetMock.mockReturnValue([
      { from: 'rem', factor: 16, to: 'px' },
      { from: 'rpx', factor: 0.5, to: 'px' },
    ])

    const plugin = getUnitsToPxPlugin(createOptions({ unitsToPx: true })) as Plugin | null

    expect(unitConverterMock).toHaveBeenCalledTimes(1)
    expect(unitsToPxPresetMock).toHaveBeenCalledWith({})
    expect(unitConverterMock).toHaveBeenCalledWith(expect.objectContaining({
      rules: expect.arrayContaining([
        expect.objectContaining({ from: 'rem', factor: 16, to: 'px' }),
        expect.objectContaining({ from: 'rpx', factor: 0.5, to: 'px' }),
      ]),
    }))
    expect(plugin?.postcssPlugin).toBe('mock-units')
  })
})

describe('getUnitConversionPlugin', () => {
  it('returns null when unitConversion disabled', () => {
    const plugin = getUnitConversionPlugin(createOptions({ unitConversion: false }))
    expect(plugin).toBeNull()
    expect(unitConverterMock).not.toHaveBeenCalled()
  })

  it('passes resolved platform config to rule-unit-converter', () => {
    unitConverterMock.mockImplementation(options => ({ postcssPlugin: 'mock-unit-conversion', options }))

    const config = {
      rules: [
        { from: 'px', to: 'rpx', factor: 2 },
      ],
      unitPrecision: 4,
    }
    const plugin = getUnitConversionPlugin(createOptions({
      platform: 'mp-weixin',
      unitConversion: {
        platforms: {
          weapp: config,
        },
      },
    })) as Plugin | null

    expect(unitConverterMock).toHaveBeenCalledTimes(1)
    expect(unitConverterMock).toHaveBeenCalledWith(config)
    expect(plugin?.postcssPlugin).toBe('mock-unit-conversion')
  })
})

describe('getCalcPlugin', () => {
  it('returns null without cssCalc enabled', () => {
    const plugin = getCalcPlugin(createOptions({ cssCalc: false }))
    expect(plugin).toBeNull()
    expect(calcMock).not.toHaveBeenCalled()
  })

  it('forwards only safe included properties when processing CSS', async () => {
    calcMock.mockImplementation(options => ({ postcssPlugin: 'mock-calc', options }))

    const plugin = getCalcPlugin(createOptions({
      cssCalc: {
        includeCustomProperties: ['--keep'],
        precision: 6,
      },
    })) as Plugin | null

    await postcss([plugin!]).process(':root { --keep: 1rpx } .x { width: calc(var(--keep) * 2) }', { from: undefined })
    expect(calcMock).toHaveBeenCalledTimes(1)
    expect(calcMock).toHaveBeenCalledWith({ includeCustomProperties: ['--keep'], precision: 6, customPropertyValues: new Map([['--keep', '1rpx']]) })
    expect(plugin?.postcssPlugin).toBe('postcss-calc')
  })

  it('uses mapped custom properties for boolean mode', async () => {
    calcMock.mockImplementation(options => ({ postcssPlugin: 'mock-calc', options }))
    const values = new Map([['--theme-space', '1rem']])
    const plugin = getCalcPlugin(createOptions({ cssCalc: true, customPropertyValues: values }))
    await postcss([plugin!]).process('.x { width: calc(var(--theme-space) * 2) }', { from: undefined })
    expect(calcMock).toHaveBeenCalledWith({
      customPropertyValues: values,
      includeCustomProperties: ['--theme-space'],
    })
  })

  it('does not pass unresolved properties that could freeze fallbacks', async () => {
    calcMock.mockImplementation(options => ({ postcssPlugin: 'mock-calc', options }))

    for (const cssCalc of [true, ['--keep']]) {
      const plugin = getCalcPlugin(createOptions({ cssCalc }))
      await postcss([plugin!]).process('.x { width: calc(var(--keep, 1rpx) * 2) }', { from: undefined })
    }

    expect(calcMock).toHaveBeenCalledTimes(2)
    expect(calcMock.mock.calls[0]?.[0]).toEqual({ customPropertyValues: new Map(), includeCustomProperties: [] })
    expect(calcMock.mock.calls[1]?.[0]).toEqual({ customPropertyValues: new Map(), includeCustomProperties: [] })
  })
})

describe('getCustomPropertyCleaner', () => {
  it('returns null when includeCustomProperties is not provided', () => {
    const plugin = getCustomPropertyCleaner(createOptions({ cssCalc: false }))
    expect(plugin).toBeNull()
  })

  it('keeps distinct declarations containing matched custom properties', () => {
    const plugin = getCustomPropertyCleaner(createOptions({
      cssCalc: {
        includeCustomProperties: [TW_CUSTOM_PROPERTY_REGEX],
      },
    })) as Plugin | null
    expect(plugin).not.toBeNull()

    const root = postcss.parse(':root{--foo:var(--other);--foo:var(--tw-color);}')
    plugin!.OnceExit?.(root, {} as any)
    expect(root.toString()).toBe(':root{--foo:var(--other);--foo:var(--tw-color);}')
  })
})

describe('getCalcDuplicateCleaner', () => {
  it('reuses the shared duplicate cleaner plugin when cssCalc enabled', () => {
    const first = getCalcDuplicateCleaner(createOptions({ cssCalc: true }))
    const second = getCalcDuplicateCleaner(createOptions({ cssCalc: ['--keep'] }))

    expect(first).toBe(second)
    expect(first?.postcssPlugin).toBe('postcss-calc-duplicate-cleaner')
  })
})
