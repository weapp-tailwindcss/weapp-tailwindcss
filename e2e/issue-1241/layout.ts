import type { LayoutRects, Rect } from '../issue-1214/layout'
import type { Project } from './project'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { compareLayout, layoutNodes } from '../issue-1214/layout'
import { themeSource } from './project'

export function layoutSource(base: number, marker: string) {
  const columns = ['utility', 'reference'].map((kind) => {
    const utility = kind === 'utility'
    const attr = (candidate: string, css: string) => utility ? `class="${candidate}"` : `style="${css}"`
    return `<view class="column">
<text>${kind}</text>
<view id="${kind}-box" ${attr('w-32 h-32', `width:${base * 32}rpx;height:${base * 32}rpx`)} />
<text>padding</text>
<view id="${kind}-padding" ${attr('p-4', `padding:${base * 4}rpx`)}><view id="${kind}-padding-child" class="child" /></view>
<text>negative margin</text><view class="stack"><view id="${kind}-anchor" class="anchor" /><view id="${kind}-margin" class="child ${utility ? '-mt-4' : ''}" ${utility ? '' : `style="margin-top:${-base * 4}rpx"`} /></view>
<text>positive margin</text><view class="stack"><view id="${kind}-positive-anchor" class="anchor" /><view id="${kind}-positive-margin" class="child ${utility ? 'mt-4' : ''}" ${utility ? '' : `style="margin-top:${base * 4}rpx"`} /></view>
<text>gap</text><view class="row ${utility ? 'gap-4' : ''}" ${utility ? '' : `style="gap:${base * 4}rpx"`}><view id="${kind}-gap-first" class="child" /><view id="${kind}-gap-second" class="child" /></view>
</view>`
  }).join('\n')
  return `<template><view><text id="release-marker">${marker}</text><view class="columns">${columns}</view></view></template>
<style>
page { background:#fff; color:#111; }
#release-marker { display:block; font-size:16rpx; }
.columns { display:flex; justify-content:space-between; padding:16rpx; }
.column { width:340rpx; display:flex; flex-direction:column; }
.column>text { font-size:20rpx; margin-top:12rpx; }
#utility-box,#reference-box { background:#38bdf8; }
#utility-padding,#reference-padding { background:#dbeafe; width:256rpx; box-sizing:border-box; }
.child { flex:none; width:32rpx; height:32rpx; background:#2563eb; }
.anchor { flex:none; width:128rpx; height:64rpx; background:#fed7aa; }
.stack { display:flex; flex-direction:column; align-items:flex-start; }
.row { display:flex; align-items:flex-start; }
</style>`
}

export async function setLayout(project: Project, base: number, marker: string) {
  await writeFile(project.themeFile, themeSource({ spacing: `${base}rpx` }))
  await writeFile(path.join(project.root, 'src', 'second.css'), themeSource({ spacing: `${base}rpx` }))
  await writeFile(project.pageFile, layoutSource(base, marker))
}

export async function measure(miniProgram: any, base: number, windowWidth: number) {
  const nodes = [...layoutNodes, 'positive-anchor', 'positive-margin']
  const selectors = ['utility', 'reference'].flatMap(kind => nodes.map(name => `#${kind}-${name}`))
  const rawRects = await miniProgram.evaluate(`function(selectors) { return new Promise(function(resolve) {
    const query = wx.createSelectorQuery();
    for (const selector of selectors) query.select(selector).boundingClientRect();
    query.exec(resolve);
  }); }`, selectors)
  if (!Array.isArray(rawRects) || rawRects.length !== selectors.length) {
    throw new Error('缺少本轮布局矩形')
  }
  for (let i = 0; i < rawRects.length; i++) {
    const rect = rawRects[i]
    if (!rect || rect.id !== selectors[i]!.slice(1)
      || !['left', 'top', 'width', 'height'].every(key => Number.isFinite(rect[key]))
      || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`无效矩形 ${selectors[i]}`)
    }
  }
  const groups = [0, 1].map(index => Object.fromEntries(nodes.map((name, offset) => [name, rawRects[index * nodes.length + offset]])) as LayoutRects & Record<string, Rect>)
  const comparison = compareLayout(groups[0]!, groups[1]!, windowWidth, base)
  const positive = groups.map(rects => rects['positive-margin']!.top - rects['positive-anchor']!.top - rects['positive-anchor']!.height)
  const positiveMargin = { utility: positive[0]!, reference: positive[1]!, passed: positive.every(value => value > 0) && Math.abs(positive[0]! - positive[1]!) <= 0.000001 }
  return { rawRects, comparison, positiveMargin, passed: comparison.passed && positiveMargin.passed }
}
