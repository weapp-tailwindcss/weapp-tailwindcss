/** 多属性 utility 的每个展开属性都必须有独立运行时观测。 */
export const boxSides = ['top', 'right', 'bottom', 'left'] as const
export const boxCorners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const

export const paddingProperties = (value: string) => Object.fromEntries(boxSides.map(side => [`padding-${side}`, value]))
export const radiusProperties = (value: string) => Object.fromEntries(boxCorners.map(corner => [`border-${corner}-radius`, value]))
export const borderProperties = (width: string) => Object.fromEntries(boxSides.flatMap(side => [[`border-${side}-width`, width], [`border-${side}-style`, 'solid']]))
