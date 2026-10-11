/** 对照页把布局放在内联样式中，SFC 样式块只承载待删除的覆盖。 */
export function styleRemovalPage(marker: string, phase: 'initial' | 'removed' | 'empty') {
  return `<template><view style="padding:16px">
<text id="release-marker">${marker}</text>
<view style="display:flex;gap:32px;margin-top:16px">
<view><text>utility</text><view id="probe" class="w-32 h-32 bg-sky-400" /></view>
<view><text>reference</text><view id="reference" style="width:64rpx;height:64rpx;background:#38bdf8" /></view>
</view></view></template>
${phase === 'initial' ? '<style>#probe{--spacing:3rpx;background:#ef4444}</style>' : phase === 'empty' ? '<style></style>' : ''}
`
}
