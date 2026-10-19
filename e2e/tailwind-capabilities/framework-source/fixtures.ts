export const sourceFrameworks = ['react', 'vue'] as const
export type SourceFramework = typeof sourceFrameworks[number]
export const sourceRevisions = ['initial', 'added', 'replaced', 'deleted'] as const
export type SourceRevision = typeof sourceRevisions[number]
export const sourceBranchStates = ['before', 'after', 'restored'] as const
export type SourceBranchState = typeof sourceBranchStates[number]
export const sourceKinds = ['conditional', 'array', 'object', 'static-template', 'map', 'merge', 'cva', 'variants', 'interpolation-negative'] as const
export type SourceKind = typeof sourceKinds[number]

export interface FrameworkSourceProfile {
  id: string
  framework: SourceFramework
  kind: SourceKind
  first: number
  second: number
}

// 每种语法使用独占尺寸，不能由同页其它写法碰巧补足相同候选。
export const frameworkSourceProfiles = sourceFrameworks.flatMap(framework => sourceKinds.map((kind, index): FrameworkSourceProfile => ({ id: `framework/${framework}/${kind}`, framework, kind, first: 123 + index * 30, second: 139 + index * 30 })))

export function sourceWidths(profile: FrameworkSourceProfile, revision: SourceRevision) {
  const offset = revision === 'replaced' ? 3 : 0
  return { first: profile.first + offset, second: profile.second + offset }
}

export function sourceCandidate(profile: FrameworkSourceProfile, revision: SourceRevision, active: boolean) {
  if (revision === 'initial' || revision === 'deleted') {
    return ''
  }
  const widths = sourceWidths(profile, revision)
  return `w-[${active ? widths.first : widths.second}px]`
}

export function sourceExpectedWidth(profile: FrameworkSourceProfile, revision: SourceRevision, active: boolean) {
  return revision === 'initial' || revision === 'deleted' || profile.kind === 'interpolation-negative' ? 80 : active ? sourceWidths(profile, revision).first : sourceWidths(profile, revision).second
}

export function frameworkSourceCss(framework: SourceFramework) {
  return `@import "tailwindcss" source(none);\n@source "./Probe.${framework === 'react' ? 'tsx' : 'vue'}";\n@layer base { body { margin:16px; font:16px/20px sans-serif; } .source-probe { width:80px; height:48px; margin-bottom:6px; background:#abcdef; } button { padding:8px; border:1px solid #123456; } }`
}

const quote = (value: string) => `'${value}'`

function expression(profile: FrameworkSourceProfile, revision: SourceRevision) {
  const first = sourceCandidate(profile, revision, true)
  const second = sourceCandidate(profile, revision, false)
  const widths = sourceWidths(profile, revision)
  switch (profile.kind) {
    case 'conditional': return `active ? ${quote(`p-4 ${first}`.trim())} : ${quote(`p-4 ${second}`.trim())}`
    case 'array': return `['p-4', active ? ${quote(first)} : ${quote(second)}]${profile.framework === 'react' ? '.filter(Boolean).join(\' \')' : ''}`
    case 'object': {
      const object = `{ 'p-4': true${first ? `, ${quote(first)}: active, ${quote(second)}: !active` : ''} }`
      return profile.framework === 'react' ? `clsx(${object})` : object
    }
    case 'static-template': return `\`p-4 \${active ? ${quote(first)} : ${quote(second)}}\``
    case 'map': return `classMap[active ? 'first' : 'second']`
    case 'merge': return `twMerge(${quote(first ? 'p-4 w-[91px]' : 'p-4')}, active ? ${quote(first)} : ${quote(second)})`
    case 'cva': return `cvaProbe({ size: active ? 'first' : 'second' })`
    case 'variants': return `tvProbe({ size: active ? 'first' : 'second' })`
    case 'interpolation-negative': return first ? `\`p-4 w-[\${active ? ${widths.first} : ${widths.second}}px]\`` : quote('p-4')
  }
}

function runtimeSetup(profiles: FrameworkSourceProfile[], revision: SourceRevision) {
  const byKind = (kind: SourceKind) => profiles.find(profile => profile.kind === kind)!
  const variants = (kind: SourceKind) => `{ first: ${quote(sourceCandidate(byKind(kind), revision, true))}, second: ${quote(sourceCandidate(byKind(kind), revision, false))} }`
  const map = byKind('map')
  return `import { clsx } from '@weapp-tailwindcss/runtime'
import { create as createMerge } from '@weapp-tailwindcss/merge'
import { create as createCva } from '@weapp-tailwindcss/cva'
import { create as createVariants } from '@weapp-tailwindcss/variants'
const { twMerge } = createMerge({ escape: false, unescape: false })
const { cva } = createCva({ escape: false, unescape: false })
const { tv } = createVariants({ escape: false, unescape: false })
const classMap = { first: ${quote(`p-4 ${sourceCandidate(map, revision, true)}`.trim())}, second: ${quote(`p-4 ${sourceCandidate(map, revision, false)}`.trim())} }
const cvaProbe = cva('p-4', { variants: { size: ${variants('cva')} } })
const tvProbe = tv({ base: ${quote(sourceCandidate(byKind('variants'), revision, true) ? 'p-4 w-[93px]' : 'p-4')}, variants: { size: ${variants('variants')} } })`
}

/** 源码内含真正的框架表达式；候选只存在于该文件，不通过 inline source 或页面注入补齐。 */
export function frameworkSource(framework: SourceFramework, revision: SourceRevision, runId: string) {
  const profiles = frameworkSourceProfiles.filter(profile => profile.framework === framework)
  const marker = JSON.stringify(`${runId}/${framework}/${revision}`)
  if (framework === 'react') {
    return `import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
${runtimeSetup(profiles, revision)}
const revision = ${marker}
function App() {
  const [active, setActive] = useState(true)
  return <main id="framework-root" data-framework="react" data-revision={revision}>
    <button id="toggle" onClick={() => setActive(value => !value)}>Toggle branch</button>
${profiles.map(profile => `    <div id="probe-${profile.kind}" data-active={String(active)} className={'source-probe ' + (${expression(profile, revision)})}>${profile.kind}</div>`).join('\n')}
  </main>
}
createRoot(document.getElementById('app')!).render(<App />)
`
  }
  return `<script setup>
import { ref } from 'vue'
${runtimeSetup(profiles, revision)}
const revision = ${marker}
const active = ref(true)
</script>
<template>
  <main id="framework-root" data-framework="vue" :data-revision="revision">
    <button id="toggle" @click="active = !active">Toggle branch</button>
${profiles.map(profile => `    <div id="probe-${profile.kind}" :data-active="String(active)" class="source-probe" :class="${expression(profile, revision)}">${profile.kind}</div>`).join('\n')}
  </main>
</template>
`
}
