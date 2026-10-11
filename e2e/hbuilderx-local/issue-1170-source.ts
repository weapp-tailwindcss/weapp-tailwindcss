import type { WebHmrStep } from './cases'
import { webCases } from './cases'

const className = 'text-xl text-[#f7fbff] bg-[#102938] w-[200px]'
export const issue1170Source = `<template>
  <view>
    <view class="hbuilderx-web-hmr-probe issue-1170-marker">issue-1170-initial</view>
    <text id="issue-1170-text" class="${className}">Hello Tailwind on uni-app xxxx</text>
  </view>
</template>
<script setup lang="uts"></script>
<style lang="scss" scoped></style>
`

function runtimeStyles(width = '200px') {
  return [{
    selector: '#issue-1170-text',
    styles: { width, color: 'rgb(247, 251, 255)', backgroundColor: 'rgb(16, 41, 56)', fontSize: '20px' },
  }]
}

export function issue1170Case() {
  const item = webCases.find(item => item.name === 'issue-1144-uni-app-x-web')!
  const hmrSteps: WebHmrStep[] = Array.from({ length: 6 }, (_, index) => ({
    markerClass: 'issue-1170-marker',
    markerText: `issue-1170-text-save-${index + 1}`,
    cssContains: [],
    runtimeStyles: runtimeStyles(),
    sourceMutation: {
      file: item.sourceFile,
      replace: {
        from: index === 0 ? 'Hello Tailwind on uni-app xxxx' : `Hello Tailwind on uni-app save-${index}`,
        to: `Hello Tailwind on uni-app save-${index + 1}`,
      },
    },
    reload: true,
  }))
  for (const [index, width] of [213, 227, 200].entries()) {
    hmrSteps.push({
      markerClass: 'issue-1170-marker',
      markerText: `issue-1170-class-save-${index + 1}`,
      cssContains: [],
      runtimeStyles: runtimeStyles(`${width}px`),
      sourceMutation: {
        file: item.sourceFile,
        replace: { from: `w-[${[200, 213, 227][index]}px]`, to: `w-[${width}px]` },
      },
      reload: true,
    })
  }
  return {
    ...item,
    markerAnchor: '<text id="issue-1170-text"',
    initialCssContains: ['weapp-tailwindcss uni-app-x web preflight reset'],
    initialTextContains: ['Hello Tailwind on uni-app xxxx'],
    initialRuntimeStyles: runtimeStyles(),
    persistentRuntimeStyles: [],
    hmrSteps,
  }
}
