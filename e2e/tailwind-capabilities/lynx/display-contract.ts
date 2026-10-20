export const lynxDisplayDocumentation = 'https://lynxjs.org/api/css/properties/display.html'
export const lynxRejectedDisplayValues = ['inline-block', 'inline-flex', 'inline-grid'] as const

export interface LynxDisplayRejection {
  kind: 'lynx-documented-display-rejection'
  documentation: typeof lynxDisplayDocumentation
  property: 'display'
  value: typeof lynxRejectedDisplayValues[number]
}

/** 仅为官方明确列举的三个外部 inline 布局值提供无诊断拒绝合同。 */
export function validLynxDisplayRejection(rejection: LynxDisplayRejection): boolean {
  return rejection.kind === 'lynx-documented-display-rejection'
    && rejection.documentation === lynxDisplayDocumentation
    && rejection.property === 'display'
    && lynxRejectedDisplayValues.includes(rejection.value)
}
