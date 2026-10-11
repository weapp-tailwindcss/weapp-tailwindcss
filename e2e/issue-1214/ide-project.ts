import { writeFile } from 'node:fs/promises'
import { resolveWechatAppId } from '../../scripts/wechat-app-id'
import { createProject } from './project'

export const runtimeSpacing = 8

export function layoutPageSource(marker: string) {
  if (!/^[\w-]+$/.test(marker)) {
    throw new Error('尺寸探针 marker 只能包含字母、数字、下划线和连字符。')
  }
  const columns = ['utility', 'reference'].map((kind) => {
    const utility = kind === 'utility'
    return `<view class="probe-column">
      <text>${utility ? 'Tailwind 工具类' : '直接 rpx 对照'}</text>
      <text>宽高</text>
      <view id="${kind}-box" class="probe-box ${utility ? 'w-32 h-32' : ''}" ${utility ? '' : 'style="width:256rpx;height:256rpx"'} />
      <text>内边距</text>
      <view id="${kind}-padding" class="probe-inset ${utility ? 'p-4' : ''}" ${utility ? '' : 'style="padding:32rpx"'}><view id="${kind}-padding-child" class="probe-child" /></view>
      <text>负外边距</text>
      <view class="probe-stack"><view id="${kind}-anchor" class="probe-anchor" /><view id="${kind}-margin" class="probe-child ${utility ? '-mt-4' : ''}" ${utility ? '' : 'style="margin-top:-32rpx"'} /></view>
      <text>子元素间距</text>
      <view id="${kind}-gap" class="probe-row ${utility ? 'gap-4' : ''}" ${utility ? '' : 'style="gap:32rpx"'}><view id="${kind}-gap-first" class="probe-child" /><view id="${kind}-gap-second" class="probe-child" /></view>
    </view>`
  }).join('\n')
  return `<template><view class="issue-1214-runtime"><text id="issue-1214-marker">${marker}</text><view class="probe-columns">${columns}</view></view></template>
<style>
page { background:#fff; color:#111; }
.issue-1214-runtime { padding:16rpx; }
#issue-1214-marker { display:block; font-size:14rpx; }
.probe-columns { display:flex; justify-content:space-between; }
.probe-column { display:flex; flex-direction:column; width:340rpx; }
.probe-column > text { font-size:24rpx; margin-top:16rpx; }
.probe-box { background:#38bdf8; }
.probe-inset { box-sizing:border-box; width:256rpx; height:128rpx; background:#dbeafe; }
.probe-child { flex:none; width:32rpx; height:32rpx; background:#2563eb; }
.probe-stack { display:flex; flex-direction:column; align-items:flex-start; }
.probe-anchor { flex:none; width:128rpx; height:64rpx; background:#fed7aa; }
.probe-row { display:flex; align-items:flex-start; }
</style>
`
}

export async function createLayoutProject(marker: string) {
  const project = await createProject({ spacing: `${runtimeSpacing}rpx`, calc: 'default', wechatAppId: resolveWechatAppId() })
  try {
    await writeFile(project.pageFile, layoutPageSource(marker))
    return project
  }
  catch (error) {
    await project.close()
    throw error
  }
}
