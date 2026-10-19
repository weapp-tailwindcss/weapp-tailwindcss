import type { UtilityInventoryEntry } from '../inventory'

export type RegistryProfileKind = 'view' | 'text' | 'svg' | 'image' | 'table' | 'caption' | 'cell' | 'list' | 'grid' | 'grid-item' | 'flex' | 'flex-item' | 'scroll' | 'children' | 'input'

export interface RegistryWebProfile {
  index: number
  id: string
  featureId: string
  candidate: string
  kind: RegistryProfileKind
  properties: string[]
  css: string
  html: string
  declarations: UtilityInventoryEntry['declarations']
  requiredEffects: string[]
}

const metadata = new Set(['syntax', 'inherits', 'initial-value'])
const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="80"%3E%3Cpath fill="%23123456" d="M0 0h80v80H0z"/%3E%3Cpath fill="%23abcdef" d="M80 0h80v80H80z"/%3E%3C/svg%3E'
const content = 'Tailwind 0123\tsemantic sample with enough words to wrap across several lines.'
const child = '<span data-child>First sample</span><span data-child>Second sample</span><span data-child>Third sample</span>'

export const registryBaseCss = `
html { font-size:16px; color-scheme:light; }
body { margin:0; background:white; }
.registry-case { position:relative; width:300px; height:240px; padding:20px; overflow:visible; }
.registry-probe { display:block; position:relative; width:96px; height:64px; margin:11px; padding:7px; border:3px solid #456789; color:#123456; background-color:#abcdef; font:16px/20px sans-serif; }
.registry-probe > [data-child] { display:block; width:36px; height:24px; padding:0; margin:0; border:0 solid #123456; }
.registry-parent { display:block; position:relative; width:220px; height:180px; }
.profile-flex .registry-probe { display:flex; flex-wrap:wrap; width:180px; height:130px; }
.profile-flex-item .registry-parent { display:flex; }
.profile-flex-item .registry-parent > [data-sibling] { width:40px; height:40px; flex-shrink:0; }
.profile-grid .registry-probe { display:grid; width:180px; height:130px; grid-template-columns:60px 60px; grid-template-rows:40px 40px; }
.profile-grid-item .registry-parent { display:grid; grid-template-columns:60px 60px 60px; grid-template-rows:40px 40px 40px; }
.profile-text .registry-probe { display:inline-block; height:auto; }
.profile-scroll .registry-probe { overflow:scroll; width:130px; height:110px; }
.profile-scroll .registry-probe > [data-child] { width:300px; height:160px; scroll-snap-align:start; }
.profile-table .registry-probe { display:table; width:180px; height:100px; }
.profile-caption .registry-probe { display:table-caption; width:auto; height:auto; }
.profile-cell .registry-probe { display:table-cell; }
.profile-list .registry-probe { display:list-item; }
.profile-input .registry-probe { width:auto; height:auto; }
.profile-children .registry-probe { display:flex; width:180px; height:100px; }
.profile-svg svg { width:220px; height:180px; }
.profile-svg .registry-probe { x:10px; y:10px; }
`

function profileKind(entry: UtilityInventoryEntry, properties: string[]): RegistryProfileKind {
  const has = (pattern: RegExp) => properties.some(property => pattern.test(property))
  if (/^(?:space-|divide-)/.test(entry.root)) {
    return 'children'
  }
  if (has(/^(?:fill|stroke|stroke-width|mask-type|transform-box)$/)) {
    return 'svg'
  }
  if (has(/^object-/)) {
    return 'image'
  }
  if (has(/^caption-side$/)) {
    return 'caption'
  }
  if (has(/^vertical-align$/)) {
    return 'cell'
  }
  if (has(/^(?:table-layout|border-collapse|border-spacing)$/)) {
    return 'table'
  }
  if (has(/^list-style-/)) {
    return 'list'
  }
  if (has(/^(?:field-sizing|appearance|accent-color|caret-color)$/)) {
    return 'input'
  }
  if (has(/^(?:scroll-|overscroll-|overflow|resize|touch-action)/) || entry.root.startsWith('snap-')) {
    return 'scroll'
  }
  if (has(/^grid-(?:column|row)/)) {
    return 'grid-item'
  }
  if (has(/^grid-/)) {
    return 'grid'
  }
  if (has(/^(?:flex(?:-basis|-grow|-shrink)?|order|align-self|justify-self|place-self)$/)) {
    return 'flex-item'
  }
  if (has(/^(?:flex-|gap|row-gap|column-gap|align-|justify-|place-)/)) {
    return 'flex'
  }
  if (has(/^(?:font-|text-|line-height|letter-spacing|white-space|hyphens|word-break|tab-size|overflow-wrap|columns|break-|content|color$)/)) {
    return 'text'
  }
  return 'view'
}

const alternatives: Array<[RegExp, string[]]> = [
  [/^display$/, ['inline-block', 'block', 'flex']],
  [/^position$/, ['static', 'relative']],
  [/^visibility$/, ['hidden', 'visible']],
  [/^opacity$/, ['0.37', '0.81']],
  [/^(?:width|height|inline-size|block-size)$/, ['73px', '119px']],
  [/^(?:min-|max-)(?:width|height|inline-size|block-size)$/, ['47px', '137px']],
  [/^(?:padding|margin|inset|top|right|bottom|left|gap|row-gap|column-gap|border-spacing|outline-offset|text-indent|letter-spacing|scroll-margin|scroll-padding)/, ['13px', '29px']],
  [/^border.*(?:width|radius)$/, ['5px', '17px']],
  [/^(?:border.*style|outline-style)$/, ['dashed', 'dotted']],
  [/^(?:color|background-color|border-color|fill|stroke|accent-color|caret-color)$/, ['rgb(19, 83, 127)', 'rgb(127, 83, 19)']],
  [/^font-size$/, ['19px', '29px']],
  [/^line-height$/, ['31px', '43px']],
  [/^font-weight$/, ['350', '750']],
  [/^font-style$/, ['italic', 'normal']],
  [/^font-stretch$/, ['75%', '125%']],
  [/^font-variant-numeric$/, ['oldstyle-nums', 'lining-nums']],
  [/^font-feature-settings$/, ['"kern" 0', '"kern" 1']],
  [/^text-align$/, ['right', 'left']],
  [/^text-transform$/, ['uppercase', 'lowercase']],
  [/^text-decoration-line$/, ['overline', 'underline']],
  [/^text-decoration-style$/, ['dashed', 'dotted']],
  [/^(?:text-decoration-thickness|text-underline-offset|stroke-width)$/, ['5px', '9px']],
  [/^white-space$/, ['pre-wrap', 'normal']],
  [/^text-wrap$/, ['nowrap', 'wrap']],
  [/^word-break$/, ['break-all', 'normal']],
  [/^overflow-wrap$/, ['anywhere', 'normal']],
  [/^(?:hyphens|-webkit-hyphens)$/, ['manual', 'none']],
  [/^text-overflow$/, ['ellipsis', 'clip']],
  [/^text-shadow$/, ['2px 3px 1px rgb(127, 83, 19)', 'none']],
  [/^box-shadow$/, ['2px 3px 1px rgb(127, 83, 19)', 'none']],
  [/^box-sizing$/, ['content-box', 'border-box']],
  [/^flex-direction$/, ['row-reverse', 'column']],
  [/^flex-wrap$/, ['wrap-reverse', 'nowrap']],
  [/^flex$/, ['0 0 41px', '1 1 23px']],
  [/^flex-basis$/, ['41px', '83px']],
  [/^(?:flex-grow|flex-shrink|order|z-index)$/, ['3', '7']],
  [/^(?:align|justify|place)-(?:content|items|self)$/, ['end', 'start']],
  [/^grid-template-(?:columns|rows)$/, ['37px 53px', '43px 71px']],
  [/^grid-auto-(?:columns|rows)$/, ['37px', '53px']],
  [/^grid-auto-flow$/, ['column', 'row dense']],
  [/^grid-(?:column|row)(?:-start|-end)?$/, ['2', '3']],
  [/^overflow(?:-[xy])?$/, ['hidden', 'scroll']],
  [/^overscroll-behavior(?:-[xy])?$/, ['contain', 'none']],
  [/^scroll-snap-type$/, ['x proximity', 'y mandatory']],
  [/^scroll-snap-align$/, ['center', 'end']],
  [/^scroll-snap-stop$/, ['always', 'normal']],
  [/^scroll-behavior$/, ['smooth', 'auto']],
  [/^scrollbar-width$/, ['thin', 'none']],
  [/^scrollbar-gutter$/, ['stable', 'auto']],
  [/^scrollbar-color$/, ['rgb(19,83,127) rgb(127,83,19)', 'auto']],
  [/^resize$/, ['both', 'none']],
  [/^touch-action$/, ['pan-x', 'pan-y']],
  [/^pointer-events$/, ['none', 'auto']],
  [/^(?:user-select|-webkit-user-select)$/, ['all', 'none']],
  [/^cursor$/, ['crosshair', 'wait']],
  [/^appearance$/, ['none', 'auto']],
  [/^field-sizing$/, ['content', 'fixed']],
  [/^vertical-align$/, ['bottom', 'top']],
  [/^table-layout$/, ['fixed', 'auto']],
  [/^border-collapse$/, ['collapse', 'separate']],
  [/^caption-side$/, ['bottom', 'top']],
  [/^list-style-position$/, ['inside', 'outside']],
  [/^list-style-type$/, ['square', 'circle']],
  [/^list-style-image$/, ['linear-gradient(red,blue)', 'none']],
  [/^background-image$/, ['linear-gradient(red,blue)', 'none']],
  [/^background-size$/, ['17px 29px', '31px 43px']],
  [/^background-position$/, ['17px 29px', '31px 43px']],
  [/^background-repeat$/, ['repeat-x', 'repeat-y']],
  [/^background-(?:clip|origin)$/, ['content-box', 'border-box']],
  [/^background-attachment$/, ['fixed', 'local']],
  [/^(?:background|mix)-blend-mode$/, ['multiply', 'screen']],
  [/^isolation$/, ['isolate', 'auto']],
  [/^mask-image$/, ['linear-gradient(black,transparent)', 'none']],
  [/^mask-(?:clip|origin)$/, ['content-box', 'border-box']],
  [/^mask-(?:mode|type)$/, ['alpha', 'luminance']],
  [/^mask-composite$/, ['exclude', 'intersect']],
  [/^mask-repeat$/, ['repeat-x', 'repeat-y']],
  [/^mask-position$/, ['17px 29px', '31px 43px']],
  [/^mask-size$/, ['17px 29px', '31px 43px']],
  [/^(?:filter|backdrop-filter|-webkit-backdrop-filter)$/, ['blur(3px)', 'blur(7px)']],
  [/^transform$/, ['translateX(13px)', 'translateX(29px)']],
  [/^translate$/, ['13px 17px', '29px 31px']],
  [/^rotate$/, ['13deg', '29deg']],
  [/^scale$/, ['0.7', '1.3']],
  [/^transform-origin$/, ['13px 17px', '29px 31px']],
  [/^transform-style$/, ['preserve-3d', 'flat']],
  [/^transform-box$/, ['fill-box', 'view-box']],
  [/^perspective$/, ['137px', '271px']],
  [/^perspective-origin$/, ['13px 17px', '29px 31px']],
  [/^backface-visibility$/, ['hidden', 'visible']],
  [/^transition-property$/, ['opacity', 'color']],
  [/^(?:transition-duration|transition-delay)$/, ['0.137s', '0.271s']],
  [/^transition-timing-function$/, ['linear', 'steps(3)']],
  [/^transition-behavior$/, ['allow-discrete', 'normal']],
  [/^animation$/, ['none', 'pulse 2s linear infinite']],
  [/^contain$/, ['layout', 'paint']],
  [/^container-type$/, ['inline-size', 'normal']],
  [/^content$/, ['"reference baseline"', 'normal']],
  [/^aspect-ratio$/, ['3 / 2', '2 / 3']],
  [/^zoom$/, ['0.8', '1.2']],
  [/^tab-size$/, ['3', '7']],
  [/^float$/, ['left', 'right']],
  [/^clear$/, ['left', 'right']],
  [/^will-change$/, ['opacity', 'transform']],
  [/^forced-color-adjust$/, ['none', 'auto']],
  [/^color-scheme$/, ['dark', 'light']],
  [/^columns$/, ['2', '3']],
  [/^break-(?:before|after)$/, ['column', 'avoid']],
  [/^break-inside$/, ['avoid-column', 'auto']],
  [/^(?:box-decoration-break|-webkit-box-decoration-break)$/, ['clone', 'slice']],
  [/^-webkit-line-clamp$/, ['2', '3']],
  [/^-webkit-box-orient$/, ['horizontal', 'vertical']],
  [/^(?:-webkit-font-smoothing|-moz-osx-font-smoothing)$/, ['auto', 'grayscale']],
]

function baseline(properties: UtilityInventoryEntry['declarations']) {
  return properties.flatMap(({ property, value }) => {
    const options = alternatives.find(([pattern]) => pattern.test(property))?.[1]
    return options ? [`${property}:${options.find(option => option !== value) ?? options[0]};`] : []
  }).join('')
}

export function registryWebProfile(entry: UtilityInventoryEntry, index: number): RegistryWebProfile {
  const properties = [...new Set(entry.declarations.map(item => item.property).filter(property => !metadata.has(property)))]
  const kind = profileKind(entry, properties)
  const selector = `[data-case="${index}"] .registry-probe`
  const extras = registryConsumer(entry.root, properties)
  const attrs = 'class="registry-probe CANDIDATE" data-probe'
  const body = kind === 'svg'
    ? properties.includes('mask-type') ? `<svg><defs><mask ${attrs} id="mask-${index}"><rect width="160" height="80" fill="red"/></mask></defs><rect data-child width="160" height="80" fill="blue" mask="url(#mask-${index})"/></svg>` : `<svg><rect ${attrs}/></svg>`
    : kind === 'image'
      ? `<img ${attrs} src='${image}' alt="semantic reference">`
      : kind === 'table'
        ? `<table ${attrs}><tbody><tr><td data-child>First table cell</td><td data-child>Second cell</td></tr><tr><td>Third</td><td>Fourth</td></tr></tbody></table>`
        : kind === 'caption'
          ? `<table><caption ${attrs}>Table caption</caption><tbody><tr><td>Cell</td></tr></tbody></table>`
          : kind === 'cell'
            ? `<table><tbody><tr style="height:130px"><td ${attrs}>Cell</td><td>Other</td></tr></tbody></table>`
            : kind === 'list'
              ? `<ul><li ${attrs}>${content}</li></ul>`
              : kind === 'input'
                ? `<input ${attrs} value="Tailwind input" type="text">`
                : `<div ${attrs}>${kind === 'text' ? content : child}</div>`
  return { index, id: `registry/${entry.id}`, featureId: entry.id, candidate: entry.witness, kind, properties: [...new Set([...properties, ...extras.properties])], css: `${selector},${selector} > [data-child]{${baseline(entry.declarations)}}\n${selector}{${extras.css}}\n${selector} > [data-child]{${extras.childCss ?? ''}}${properties.includes('content') ? `\n${selector}::before{content:inherit;}` : ''}`, html: `<section class="registry-case profile-${kind}" data-case="${index}"><div class="registry-parent">${body}<span data-sibling>Sibling</span></div></section>`, declarations: entry.declarations, requiredEffects: extras.requiredEffects ?? [] }
}

function registryConsumer(root: string, properties: string[]): { css: string, childCss?: string, properties: string[], requiredEffects?: string[] } {
  if (/^bg-(?:linear|radial|conic|gradient)-?/.test(root)) {
    const position = root.includes('radial') || root.includes('conic') ? 'in oklab' : '90deg in oklab'
    return { css: `--tw-gradient-from:red;--tw-gradient-to:blue;--tw-gradient-stops:var(--tw-gradient-position,${position}),red 0%,blue 100%;`, properties: ['background-image'], requiredEffects: ['background-image'] }
  }
  if (/^(?:from|via|to)$/.test(root)) {
    return { css: '--tw-gradient-from-position:23%;--tw-gradient-via-position:51%;--tw-gradient-to-position:79%;background-image:linear-gradient(90deg,red var(--tw-gradient-from-position,0%),green var(--tw-gradient-via-position,50%),blue var(--tw-gradient-to-position,100%));', properties: ['background-image'] }
  }
  if (root === 'via-none') {
    return { css: '--tw-gradient-via-stops:linear-gradient(green,yellow);background-image:var(--tw-gradient-via-stops,linear-gradient(red,blue));', properties: ['background-image'] }
  }
  if (/^mask-(?:circle$|ellipse$|radial-(?:at(?:-|$)|(?:closest|farthest)-(?:corner|side)$))/.test(root)) {
    return { css: `--tw-mask-radial-shape:${root === 'mask-ellipse' ? 'circle' : 'ellipse'};--tw-mask-radial-size:${root.endsWith('closest-side') ? 'farthest-side' : 'closest-side'};--tw-mask-radial-position:23% 37%;mask-image:radial-gradient(var(--tw-mask-radial-shape,ellipse) var(--tw-mask-radial-size,farthest-corner) at var(--tw-mask-radial-position,center),black 50%,transparent 100%);`, properties: ['mask-image'], requiredEffects: ['mask-image'] }
  }
  if (/^mask-(?:linear|radial|conic)/.test(root)) {
    return { css: '--tw-mask-linear:linear-gradient(black,black);--tw-mask-radial:linear-gradient(black,black);--tw-mask-conic:linear-gradient(black,black);--tw-mask-linear-stops:var(--tw-mask-linear-position,90deg),black 0%,transparent 100%;--tw-mask-radial-stops:var(--tw-mask-radial-size,farthest-side) at center,black 0%,transparent 100%;--tw-mask-conic-stops:from var(--tw-mask-conic-position,0deg),black 0deg,transparent 360deg;', properties: ['mask-image'], requiredEffects: ['mask-image'] }
  }
  if (/^(?:space|divide)-[xy]-reverse$/.test(root)) {
    const name = `--tw-${root}`
    const start = root.includes('-x-') ? 'left' : 'top'
    const end = root.includes('-x-') ? 'right' : 'bottom'
    const properties = root.startsWith('space-') ? [`margin-${start}`, `margin-${end}`] : [`border-${start}-width`, `border-${end}-width`]
    return { css: `${name}:0;`, childCss: `${properties[0]}:calc(16px * var(${name},0));${properties[1]}:calc(16px * (1 - var(${name},0)));`, properties }
  }
  if (root === 'duration-initial') {
    return { css: '--tw-duration:0.25s;transition-duration:var(--tw-duration,0.125s);', properties: ['transition-duration'] }
  }
  if (root === 'ring-inset') {
    return { css: '--tw-ring-inset:initial;box-shadow:var(--tw-ring-inset,) 0 0 0 3px red;', properties: ['box-shadow'] }
  }
  if (root === 'ring-offset') {
    return { css: '--tw-ring-offset-width:7px;box-shadow:0 0 0 var(--tw-ring-offset-width,0px) red;', properties: ['box-shadow'] }
  }
  if (/^(?:inset-shadow|shadow|text-shadow)-initial$/.test(root)) {
    const name = `--tw-${root.replace('-initial', '')}-color`
    const property = root === 'text-shadow-initial' ? 'text-shadow' : 'box-shadow'
    return { css: `${name}:blue;${property}:${root.startsWith('inset-') ? 'inset ' : ''}2px 3px 1px var(${name},red);`, properties: [property] }
  }
  if (/^snap-(?:mandatory|proximity)$/.test(root)) {
    return { css: `--tw-scroll-snap-strictness:${root === 'snap-mandatory' ? 'proximity' : 'mandatory'};scroll-snap-type:x var(--tw-scroll-snap-strictness,proximity);`, properties: ['scroll-snap-type'] }
  }
  if (properties.some(property => /^background-(?:attachment|blend-mode|clip|origin|position|repeat|size)$/.test(property))) {
    return { css: 'background-image:linear-gradient(135deg,rgba(255,0,0,.5),rgba(0,0,255,.5));', properties: ['background-image'], requiredEffects: ['background-image'] }
  }
  return { css: '', properties: [] }
}

export function renderRegistryProfile(profile: RegistryWebProfile, baselineOnly: boolean) {
  return profile.html.replace('CANDIDATE', baselineOnly ? '' : profile.candidate.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))
}
