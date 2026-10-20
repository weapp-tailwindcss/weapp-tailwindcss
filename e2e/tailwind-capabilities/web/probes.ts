import type { RuntimeProbe } from '../types'
import type { WebControl } from './controls'
import type { WebGuard } from './guards'
import type { WebPixelSample } from './pixels'
import { borderProperties, paddingProperties, radiusProperties } from '../style-properties'
import { webFeatureBindings } from './features'
import { variantWebProbes } from './variants'

export interface WebLayoutRect {
  left: number
  top: number
  width: number
  height: number
}

export interface WebLayout {
  display: string
  width: number
  height: number
  children: WebLayoutRect[]
}

export interface WebProbe extends RuntimeProbe {
  features: string[]
  selector?: string
  actionTarget?: string
  attribute?: { name: string, value: string }
  active?: boolean
  pixels?: WebPixelSample[]
  layout?: WebLayout
  controls?: WebControl[]
  checkpoints?: Array<{ afterControl: number, name: string, expected: string }>
  guards?: WebGuard[]
  styles?: Record<string, string>
}

const element = '<div id="probe" class="probe CANDIDATE">Tailwind probe</div>'
const text = '<span id="probe" class="probe CANDIDATE">Tailwind probe</span>'
const stateElement = '<button id="probe" class="probe CANDIDATE" style="height:40px">Tailwind probe</button>'
const layoutChildren = '<div data-layout-child style="width:20px;height:20px;flex:none"></div><div data-layout-child style="width:30px;height:40px;flex:none"></div>'
const layoutElement = `<div id="probe" class="probe CANDIDATE" style="width:200px;height:100px">${layoutChildren}</div>`
const rect = (left: number, top: number, width: number, height: number): WebLayoutRect => ({ left, top, width, height })
const nativeUnsupported = { support: 'unsupported' as const, reason: '此语义依赖浏览器 DOM、CSS 状态或浏览器专用组件，微信需独立负向验证。' }

const authoredWebProbes: Omit<WebProbe, 'features'>[] = [
  { id: 'display-flex', candidate: 'flex', html: element, component: 'view', property: 'display', expected: 'flex' },
  { id: 'box-sizing', candidate: 'box-border', html: '<div id="probe" class="probe box-model CANDIDATE" style="width:100px;height:60px;padding:10px;border:5px solid transparent"></div>', component: 'view', property: 'box-sizing', expected: 'border-box', layout: { display: 'block', width: 100, height: 60, children: [] } },
  { id: 'position', candidate: 'relative', html: element, component: 'view', property: 'position', expected: 'relative' },
  { id: 'visibility', candidate: 'invisible', html: element, component: 'view', property: 'visibility', expected: 'hidden' },
  { id: 'z-index', candidate: 'z-[17]', html: element, component: 'view', property: 'z-index', expected: '17' },
  { id: 'overflow', candidate: 'overflow-hidden', html: element, component: 'view', property: 'overflow', expected: 'hidden' },
  { id: 'isolation', candidate: 'isolate', html: element, component: 'view', property: 'isolation', expected: 'isolate', weapp: nativeUnsupported },
  { id: 'flex-direction', candidate: 'flex flex-col', html: layoutElement, component: 'children', property: 'flex-direction', expected: 'column', layout: { display: 'flex', width: 200, height: 100, children: [rect(0, 0, 20, 20), rect(0, 20, 30, 40)] } },
  { id: 'flex-alignment', candidate: 'flex items-center', html: layoutElement, component: 'children', property: 'align-items', expected: 'center', layout: { display: 'flex', width: 200, height: 100, children: [rect(0, 40, 20, 20), rect(20, 30, 30, 40)] } },
  { id: 'justify-content', candidate: 'flex justify-between', html: layoutElement, component: 'children', property: 'justify-content', expected: 'space-between', layout: { display: 'flex', width: 200, height: 100, children: [rect(0, 0, 20, 20), rect(170, 0, 30, 40)] } },
  { id: 'flex-grow', candidate: 'grow-[2]', html: '<div style="display:flex;width:200px;height:100px"><div id="probe" class="probe CANDIDATE" style="width:20px;height:20px;flex-basis:20px"></div><div style="width:20px;height:20px;flex-grow:1"></div></div>', component: 'view', property: 'flex-grow', expected: '2', layout: { display: 'block', width: 380 / 3, height: 20, children: [] } },
  { id: 'flex-shrink', candidate: 'shrink-0', html: '<div style="display:flex;width:100px;height:100px"><div id="probe" class="probe CANDIDATE" style="width:80px;height:20px"></div><div style="width:80px;height:20px"></div></div>', component: 'view', property: 'flex-shrink', expected: '0', layout: { display: 'block', width: 80, height: 20, children: [] } },
  { id: 'gap', candidate: 'flex gap-4', html: layoutElement, component: 'children', property: 'column-gap', expected: '16px', layout: { display: 'flex', width: 200, height: 100, children: [rect(0, 0, 20, 20), rect(36, 0, 30, 40)] } },
  { id: 'grid', candidate: 'grid grid-cols-[80px_120px]', html: '<div id="probe" class="probe CANDIDATE" style="width:200px;height:100px"><div data-layout-child style="height:20px"></div><div data-layout-child style="height:30px"></div></div>', component: 'children', property: 'grid-template-columns', expected: '80px 120px', layout: { display: 'grid', width: 200, height: 100, children: [rect(0, 0, 80, 20), rect(80, 0, 120, 30)] } },
  { id: 'padding', candidate: 'p-[13px]', html: element, component: 'view', property: 'padding-top', expected: '13px', styles: paddingProperties('13px') },
  { id: 'margin', candidate: 'ml-[11px]', html: element, component: 'view', property: 'margin-left', expected: '11px' },
  { id: 'negative', candidate: '-mt-[7px]', html: element, component: 'view', property: 'margin-top', expected: '-7px' },
  { id: 'logical-padding', candidate: 'ps-[17px]', html: element, component: 'view', property: 'padding-inline-start', expected: '17px' },
  { id: 'width', candidate: 'w-[123px]', html: element, component: 'view', property: 'width', expected: '123px' },
  { id: 'height', candidate: 'h-[45px]', html: element, component: 'view', property: 'height', expected: '45px' },
  { id: 'min-width', candidate: 'min-w-[101px]', html: element, component: 'view', property: 'min-width', expected: '101px' },
  { id: 'max-height', candidate: 'max-h-[240px]', html: element, component: 'view', property: 'max-height', expected: '240px' },
  { id: 'size', candidate: 'size-[37px]', html: element, component: 'view', property: 'width', expected: '37px', styles: { width: '37px', height: '37px' } },
  { id: 'font-size', candidate: 'text-[length:22px]', html: text, component: 'text', property: 'font-size', expected: '22px' },
  { id: 'font-weight', candidate: 'font-[650]', html: text, component: 'text', property: 'font-weight', expected: '650' },
  { id: 'line-height', candidate: 'leading-[26px]', html: text, component: 'text', property: 'line-height', expected: '26px' },
  { id: 'letter-spacing', candidate: 'tracking-[2px]', html: text, component: 'text', property: 'letter-spacing', expected: '2px' },
  { id: 'text-color', candidate: 'text-[#123456]', html: text, component: 'text', property: 'color', expected: 'rgb(18, 52, 86)' },
  { id: 'text-decoration', candidate: 'underline', html: text, component: 'text', property: 'text-decoration-line', expected: 'underline' },
  { id: 'text-transform', candidate: 'uppercase', html: text, component: 'text', property: 'text-transform', expected: 'uppercase' },
  { id: 'white-space', candidate: 'whitespace-nowrap', html: text, component: 'text', property: 'white-space', expected: 'nowrap' },
  { id: 'background', candidate: 'bg-[#123456]', html: element, component: 'view', property: 'background-color', expected: 'rgb(18, 52, 86)' },
  { id: 'gradient', candidate: 'bg-linear-to-r from-[#ff0000] from-50% to-[#0000ff] to-50%', html: '<div id="probe" class="probe CANDIDATE" style="width:100px;height:60px"></div>', component: 'view', property: 'width', expected: '100px', pixels: [{ id: 'left-red', x: 0.25, y: 0.5, expected: [255, 0, 0, 255], tolerance: 2 }, { id: 'right-blue', x: 0.75, y: 0.5, expected: [0, 0, 255, 255], tolerance: 2 }] },
  { id: 'shadow', candidate: 'shadow-[8px_0_0_0_#123456]', html: '<div id="probe" class="probe CANDIDATE" style="width:100px;height:60px"></div>', component: 'view', property: 'width', expected: '100px', pixels: [{ id: 'outside-right-shadow', x: 1.04, y: 0.5, expected: [18, 52, 86, 255], tolerance: 2 }, { id: 'outside-left-clear', x: -0.04, y: 0.5, expected: [255, 255, 255, 255], tolerance: 2 }] },
  { id: 'border-width', candidate: 'border-[3px]', html: element, component: 'view', property: 'border-top-width', expected: '3px', styles: borderProperties('3px') },
  { id: 'border-radius', candidate: 'rounded-[17px]', html: element, component: 'view', property: 'border-top-left-radius', expected: '17px', styles: radiusProperties('17px') },
  { id: 'opacity', candidate: 'opacity-[.67]', html: element, component: 'view', property: 'opacity', expected: '0.67' },
  { id: 'rotate', candidate: 'rotate-[17deg]', html: element, component: 'view', property: 'rotate', expected: '17deg' },
  { id: 'transition-duration', candidate: 'duration-[125ms]', html: element, component: 'view', property: 'transition-duration', expected: '0.125s' },
  { id: 'pointer-events', candidate: 'pointer-events-none', html: element, component: 'view', property: 'pointer-events', expected: 'none' },
  { id: 'user-select', candidate: 'select-none', html: text, component: 'text', property: 'user-select', expected: 'none', weapp: nativeUnsupported },
  { id: 'arbitrary-property', candidate: '[line-height:23px]', html: text, component: 'text', property: 'line-height', expected: '23px' },
  { id: 'variable', candidate: '[--probe:17px] w-(--probe)', html: element, component: 'view', property: 'width', expected: '17px' },
  { id: 'calc', candidate: 'w-[calc(100px+23px)]', html: element, component: 'view', property: 'width', expected: '123px' },
  { id: 'important', candidate: 'p-[17px]!', html: '<div id="probe" class="probe CANDIDATE" style="padding:4px">important</div>', component: 'view', property: 'padding-top', expected: '17px', styles: paddingProperties('17px') },
  { id: 'structural-first', candidate: 'first:opacity-50', html: '<div><div id="probe" class="probe CANDIDATE">first</div><div>second</div></div>', component: 'children', property: 'opacity', expected: '0.5' },
  { id: 'arbitrary-selector', candidate: '[&>span]:text-[#123456]', html: '<div id="probe" class="probe CANDIDATE"><span id="target">child</span></div>', selector: '#target', component: 'children', property: 'color', expected: 'rgb(18, 52, 86)' },
  { id: 'supports', candidate: 'supports-[display:grid]:grid', html: element, component: 'view', property: 'display', expected: 'grid', weapp: nativeUnsupported },
  { id: 'pseudo-content', candidate: 'before:content-["probe"]', html: element, component: 'view', property: 'before:content', expected: '"probe"', weapp: nativeUnsupported },
  { id: 'hover', candidate: 'hover:bg-[#123456]', html: stateElement, component: 'view', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'hover', weapp: nativeUnsupported },
  { id: 'active', candidate: 'active:bg-[#123456]', html: stateElement, component: 'view', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'dynamic', active: true, weapp: nativeUnsupported },
  { id: 'focus', candidate: 'focus:bg-[#123456]', html: stateElement, component: 'view', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'focus', weapp: nativeUnsupported },
  { id: 'checked', candidate: 'checked:bg-[#123456]', html: '<input id="probe" class="probe CANDIDATE" type="checkbox" style="appearance:none;width:40px;height:40px">', component: 'input', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'checked', weapp: nativeUnsupported },
  { id: 'dark', candidate: 'dark:bg-[#123456]', html: element, component: 'view', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'dark' },
  { id: 'responsive', candidate: 'min-[700px]:w-[123px]', html: element, component: 'view', property: 'width', before: '80px', expected: '123px', action: 'responsive' },
  { id: 'container', candidate: '@min-[200px]:w-[123px]', html: '<div id="container" style="container-type:inline-size;width:100px"><div id="probe" class="probe CANDIDATE">container</div></div>', component: 'children', property: 'width', before: '80px', expected: '123px', action: 'container', weapp: nativeUnsupported },
  { id: 'data', candidate: 'data-[state=open]:bg-[#123456]', html: element, component: 'view', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'dynamic', attribute: { name: 'data-state', value: 'open' } },
  { id: 'aria', candidate: 'aria-checked:bg-[#123456]', html: '<button id="probe" role="checkbox" aria-checked="false" class="probe CANDIDATE">aria</button>', component: 'input', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'dynamic', attribute: { name: 'aria-checked', value: 'true' }, weapp: nativeUnsupported },
  { id: 'group-hover', candidate: 'group-hover/card:bg-[#123456]', html: '<div id="group" class="group/card"><div id="probe" class="probe CANDIDATE">group</div></div>', component: 'children', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'hover', actionTarget: '#group', weapp: nativeUnsupported },
  { id: 'peer-checked', candidate: 'peer-checked/choice:bg-[#123456]', html: '<div><input id="peer" class="peer/choice" type="checkbox"><div id="probe" class="probe CANDIDATE">peer</div></div>', component: 'children', property: 'background-color', before: 'rgb(1, 2, 3)', expected: 'rgb(18, 52, 86)', action: 'checked', actionTarget: '#peer', weapp: nativeUnsupported },
  { id: 'dynamic-class', candidate: 'w-[123px]', html: '<div id="probe" class="probe" data-candidate="CANDIDATE">dynamic</div>', component: 'view', property: 'width', before: '80px', expected: '123px', action: 'dynamic' },
]

export const webProbes: WebProbe[] = [...authoredWebProbes, ...variantWebProbes].map((probe) => {
  const features = webFeatureBindings[probe.id]
  if (!features?.length) {
    throw new Error(`${probe.id} 缺少显式能力映射`)
  }
  return { ...probe, features }
})

export const webFixtureCss = '@import "tailwindcss" source(none);\n@layer base { html { font-size:16px; } body { margin:0; } .stage { position:relative; margin:32px; width:500px; } .probe { width:80px; background-color:#010203; color:#040506; transition:none; } .box-model { box-sizing:content-box; } .pseudo-baseline::placeholder,.pseudo-baseline::first-letter,.pseudo-baseline::first-line,.pseudo-baseline::file-selector-button,.pseudo-baseline::marker,.pseudo-baseline::selection { color:#040506; } .pseudo-baseline::backdrop { background-color:#010203; } }'
