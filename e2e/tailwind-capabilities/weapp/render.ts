import type { WeappPhase, WeappProbe } from './types'
import { escape } from 'weapp-tailwindcss/escape'
import { weappFixtureCss } from './alpha-fixtures'
import { compositeColor } from './compositing'
import { weappMarker } from './marker'

export function weappPhaseInput(state: WeappPhase, runId: string, caseId: string, cssHash: string) {
  return { name: state.name, className: state.candidates.map(value => escape(value)).join(' '), inline: state.inline ?? '', reference: state.reference, witness: state.witness?.inline ?? '', compositeForeground: state.composite ? compositeColor(state.composite.foreground) : '', compositeBackground: state.composite ? compositeColor(state.composite.background) : '', marker: weappMarker(runId, caseId, state.name, cssHash).colors.map((color, id) => ({ id, color })) }
}

export const weappWxml = '<view class="frame"><text id="identity">{{runId}}|{{probe.id}}|{{state.name}}</text><view id="evidence-marker" class="evidence-marker"><view wx:for="{{state.marker}}" wx:key="id" class="evidence-cell" style="background-color:{{item.color}}" /></view><view class="slot"><text wx:if="{{probe.text}}" id="probe" class="base {{state.className}}" style="{{state.inline}}">Tailwind 123</text><view wx:else id="probe" class="base {{state.className}}" style="{{state.inline}}">{{probe.empty ? "" : "Tailwind 123"}}</view></view><view class="slot"><text wx:if="{{probe.text}}" id="reference" class="base" style="{{state.reference}}">Tailwind 123</text><view wx:else id="reference" class="base" style="{{state.reference}}">{{probe.empty ? "" : "Tailwind 123"}}</view></view><view wx:if="{{state.witness}}" id="weight-witness" class="witness" style="{{state.witness}}" /><view wx:if="{{state.compositeForeground}}" class="composite-controls"><view id="composite-foreground" class="composite-anchor" style="background-color:{{state.compositeForeground}}" /><view id="composite-background" class="composite-anchor" style="background-color:{{state.compositeBackground}}" /><view id="composite-gray" class="composite-anchor" style="background-color:rgb(128,128,128)" /></view><button id="toggle" bindtap="toggle">切换</button></view>'
export const weappPageCss = '.frame{padding:24px;--probe-width:73px;background:#fff}.slot{width:200px;min-height:100px;padding:10px 0;background:#fff}button{width:120px}.evidence-marker{display:flex;flex-wrap:wrap;width:64px;height:32px}.evidence-cell{width:4px;height:4px;flex:none}.witness{width:8px;height:8px;background:#f00}.composite-controls{display:flex}.composite-anchor{width:20px;height:20px;flex:none}'
export const weappBaseCss = '.base{display:block;box-sizing:border-box;min-height:32px;color:#111111;background-color:#eeeeee;font-size:16px;line-height:1.5}'
export const weappPageScript = 'toggle(){const phaseIndex=this.data.phaseIndex+1;if(phaseIndex>=this.data.states.length)return;this.setData({phaseIndex,state:this.data.states[phaseIndex]})}'
export const weappRenderContract = { weappWxml, weappPageCss, weappBaseCss, weappPageScript }

export function weappRuntimeFixture(probes: readonly WeappProbe[]) {
  return { probes, css: weappFixtureCss, render: weappRenderContract }
}

export function weappProjectFiles(css: string, runId: string, appid: string): Record<string, string> {
  return {
    'project.config.json': JSON.stringify({ appid, compileType: 'miniprogram', miniprogramRoot: './', projectname: 'tailwind-capability-e2e', setting: { es6: true, postcss: false, minified: false } }),
    'app.js': 'App({})',
    'app.json': JSON.stringify({ pages: ['pages/index/index'], window: { navigationStyle: 'custom' } }),
    'app.wxss': `${weappBaseCss}\n${css}`,
    'pages/index/index.json': '{}',
    'pages/index/index.wxml': weappWxml,
    'pages/index/index.wxss': weappPageCss,
    'pages/index/index.js': `Page({data:{runId:${JSON.stringify(runId)},probe:{},states:[],phaseIndex:0,state:{}},${weappPageScript}})`,
  }
}
