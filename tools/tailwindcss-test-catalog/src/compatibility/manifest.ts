import type { FeatureFamily } from './types'

export interface OfficialFeature {
  id: string
  family: FeatureFamily
  caseId: string
}

const featureGroups = {
  'layout': {
    'layout-aspect': ['aspect-ratio'],
    'layout-columns': ['columns'],
    'layout-break': ['break-after', 'break-before', 'break-inside'],
    'layout-decoration-clear': ['box-decoration-break', 'clear'],
    'layout-box-sizing': ['box-sizing'],
    'layout-display': ['display'],
    'layout-float': ['float'],
    'layout-isolation': ['isolation'],
    'layout-object-fit': ['object-fit'],
    'layout-object-position': ['object-position'],
    'layout-overflow': ['overflow'],
    'layout-overscroll': ['overscroll-behavior'],
    'layout-position': ['position', 'inset'],
    'layout-visibility': ['visibility'],
    'layout-z-index': ['z-index'],
  },
  'flex-grid': {
    'flex-grow': ['flex-basis', 'flex-grow'],
    'flex-direction': ['flex-direction'],
    'flex-wrap-order': ['flex-wrap', 'order'],
    'flex-shorthand-shrink': ['flex', 'flex-shrink'],
    'grid-template': ['grid-template-columns', 'gap'],
    'grid-placement': ['grid-column', 'grid-row'],
    'grid-auto': ['grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows'],
    'flex-alignment': ['justify-content', 'align-items'],
    'grid-justify-self': ['justify-items', 'justify-self'],
    'grid-align-content-self': ['align-content', 'align-self'],
    'grid-place': ['place-content', 'place-items', 'place-self'],
  },
  'spacing': {
    'spacing-margin': ['margin'],
    'spacing-padding': ['padding'],
    'spacing-space-between': ['space-between'],
  },
  'sizing': {
    'sizing-fixed': ['width', 'height'],
    'sizing-min-max': ['min-width', 'max-width', 'min-height', 'max-height'],
    'sizing-size': ['size'],
  },
  'typography': {
    'type-family-smoothing-stretch': ['font-family', 'font-smoothing', 'font-stretch'],
    'type-size': ['font-size', 'line-height'],
    'type-weight-style': ['font-style', 'font-weight'],
    'type-numeric': ['font-variant-numeric'],
    'type-tracking': ['letter-spacing'],
    'type-line-clamp': ['line-clamp'],
    'type-list': ['list-style-image', 'list-style-position', 'list-style-type'],
    'type-align-overflow': ['text-align', 'text-overflow'],
    'syntax-type-hint': ['text-color'],
    'type-decoration': ['text-decoration-line', 'text-decoration-thickness'],
    'type-decoration-full': ['text-decoration-color', 'text-decoration-style', 'text-underline-offset'],
    'type-transform-wrap-indent': ['text-transform', 'text-wrap', 'text-indent'],
    'type-flow': ['vertical-align', 'white-space'],
    'type-breaking': ['word-break', 'overflow-wrap', 'hyphens'],
    'type-content': ['content'],
  },
  'background': {
    'background-attachment-clip-origin': ['background-attachment', 'background-clip', 'background-origin'],
    'background-color': ['background-color'],
    'background-gradient': ['background-image'],
    'background-size': ['background-position', 'background-repeat', 'background-size'],
    'background-linear-gradient': ['gradient-color-stops'],
  },
  'border': {
    'border-radius': ['border-radius'],
    'border-width-color': ['border-width', 'border-color', 'border-style'],
    'border-divide': ['divide-width', 'divide-color', 'divide-style'],
    'border-outline': ['outline-width', 'outline-color', 'outline-style', 'outline-offset'],
  },
  'effect': {
    'effect-shadow': ['box-shadow'],
    'effect-inset-text-shadow': ['inset-shadow', 'text-shadow'],
    'effect-opacity': ['opacity'],
    'effect-blend': ['mix-blend-mode'],
    'effect-background-blend': ['background-blend-mode'],
    'effect-ring': ['ring-width', 'ring-color', 'inset-ring'],
    'effect-mask-box': ['mask-clip', 'mask-mode', 'mask-origin', 'mask-position', 'mask-repeat', 'mask-size'],
    'effect-mask-image-composite': ['mask-image', 'mask-composite', 'mask-type'],
  },
  'filter': {
    'filter-blur': ['filter', 'blur'],
    'filter-color-adjustments': ['brightness', 'contrast', 'grayscale'],
    'filter-drop-shadow': ['drop-shadow'],
    'filter-color-rotation': ['hue-rotate', 'invert', 'saturate', 'sepia'],
    'filter-backdrop': ['backdrop-filter', 'backdrop-blur'],
    'filter-backdrop-adjustments': ['backdrop-brightness', 'backdrop-contrast', 'backdrop-grayscale', 'backdrop-hue-rotate', 'backdrop-invert', 'backdrop-opacity', 'backdrop-saturate', 'backdrop-sepia'],
  },
  'table': {
    'table-layout': ['border-collapse', 'table-layout'],
    'table-spacing-caption': ['border-spacing', 'caption-side'],
  },
  'transform': {
    'transform-style-backface': ['backface-visibility', 'transform', 'transform-style'],
    'transform-perspective': ['perspective', 'perspective-origin'],
    'transform-rotate': ['rotate'],
    'transform-scale': ['scale'],
    'transform-skew': ['skew'],
    'transform-origin': ['transform-origin'],
    'transform-translate': ['translate'],
  },
  'transition-animation': {
    'transition-basic': ['transition-property', 'transition-duration', 'transition-timing-function'],
    'transition-complete': ['transition-behavior', 'transition-delay'],
    'animation-spin': ['animation'],
  },
  'interactivity': {
    'interaction-form-colors': ['accent-color', 'caret-color'],
    'interaction-form-control': ['appearance', 'field-sizing', 'resize'],
    'interaction-cursor-scheme': ['color-scheme', 'cursor'],
    'interaction-pointer': ['pointer-events'],
    'interaction-scroll': ['scroll-behavior', 'scroll-snap-type'],
    'interaction-scroll-spacing': ['scroll-margin', 'scroll-padding'],
    'interaction-snap-touch': ['scroll-snap-align', 'scroll-snap-stop', 'touch-action'],
    'interaction-select': ['user-select'],
    'interaction-will-change': ['will-change'],
  },
  'svg': {
    'svg-fill-stroke': ['fill', 'stroke', 'stroke-width'],
  },
  'accessibility': {
    'accessibility-sr': ['screen-readers'],
    'accessibility-forced-colors': ['forced-color-adjust'],
  },
  'variants': {
    'variant-responsive': ['responsive'],
    'variant-dark': ['dark-mode'],
    'variant-state': ['state'],
    'variant-structural': ['structural'],
    'variant-group-peer': ['group', 'peer'],
    'variant-data-aria': ['data', 'aria'],
    'variant-supports': ['supports'],
    'variant-pseudo-element': ['pseudo-element'],
    'variant-arbitrary': ['arbitrary-variant'],
  },
  'directives': {
    'syntax-negative': ['negative-value'],
    'syntax-important': ['important-modifier'],
    'syntax-opacity-modifier': ['modifier'],
    'syntax-arbitrary-property': ['arbitrary-property'],
    'syntax-css-variable': ['css-variable'],
    'syntax-type-hint': ['type-hint'],
    'directive-import': ['at-import'],
    'directive-theme': ['at-theme'],
    'directive-source': ['at-source', 'source-inline', 'source-not', 'brace-expansion'],
    'directive-utility': ['at-utility'],
    'directive-variant': ['at-variant', 'at-custom-variant'],
    'directive-apply': ['at-apply'],
    'directive-reference': ['at-reference'],
    'directive-config-plugin': ['at-config', 'at-plugin'],
    'directive-prefix-important': ['prefix', 'important-config'],
  },
} as const satisfies Record<FeatureFamily, Record<string, readonly string[]>>

export const officialFeatureManifest: OfficialFeature[] = Object.entries(featureGroups).flatMap(([family, cases]) => (
  Object.entries(cases as Record<string, readonly string[]>).flatMap(([caseId, features]) => (
    features.map(id => ({ id, family: family as FeatureFamily, caseId }))
  ))
))
