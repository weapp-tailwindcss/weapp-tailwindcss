<script setup lang="ts">
import { computed, ref } from 'vue'

defineProps<{ renderer: string }>()

const inlineOverride = ref(false)
const utilityOverride = ref(false)
const themeChanged = ref(false)
const sample = '第一行 Aa\n第二行 Bb'
const weightSample = 'Hamburgefontsiv'
const buildMarker = import.meta.env.SKYLINE_PROBE_BUILD
const fallbackCases = ['missing', 'initial', 'empty', 'valid', 'cycle'].flatMap(reset => ['literal', 'nested'].map(fallback => ({
  id: `probe-${reset}-${fallback}`,
  className: `probe-reset-${reset} probe-fallback-${fallback}`,
})))
const phase = computed(() => `${Number(inlineOverride.value)}/${Number(utilityOverride.value)}/${Number(themeChanged.value)}`)
const inlineStyle = computed(() => inlineOverride.value ? '--tw-leading:44px;--tw-font-weight:400' : '')
const themeStyle = computed(() => themeChanged.value ? '--text-header-md--line-height:40px;--text-header-md--font-weight:400' : '')
const referenceStyle = computed(() => `line-height:${inlineOverride.value ? 44 : utilityOverride.value ? 36 : themeChanged.value ? 40 : 32}px;font-weight:${inlineOverride.value || utilityOverride.value || themeChanged.value ? 400 : 700}`)
const weightStyle = computed(() => `font-size:32px;line-height:48px;${inlineStyle.value}`)
const weightReferenceStyle = computed(() => `font-size:32px;line-height:48px;font-weight:${inlineOverride.value || utilityOverride.value || themeChanged.value ? 400 : 700}`)

function reset() {
  inlineOverride.value = false
  utilityOverride.value = false
  themeChanged.value = false
}
</script>

<template>
  <view class="typography-probe" :style="themeStyle">
    <text id="probe-marker" class="probe-label">Skyline typography · {{ renderer }}</text>
    <text id="probe-build" :data-build="buildMarker" class="probe-label">{{ buildMarker }}</text>
    <text id="probe-phase" class="probe-label">{{ phase }}</text>
    <view class="probe-controls">
      <button id="probe-inline" @tap="inlineOverride = !inlineOverride">变量覆盖</button>
      <button id="probe-utility-toggle" @tap="utilityOverride = !utilityOverride">工具类覆盖</button>
      <button id="probe-theme" @tap="themeChanged = !themeChanged">主题切换</button>
      <button id="probe-reset" @tap="reset">恢复</button>
    </view>
    <text class="probe-label">原始 initial（Skyline 失败对照）</text>
    <text id="probe-original" class="probe-sample text-header-md" style="--tw-leading:initial;--tw-font-weight:initial">{{ sample }}</text>
    <text class="probe-label">插件输出 / 原生基准</text>
    <text id="probe-utility" class="probe-sample text-header-md" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
    <text id="probe-reference" class="probe-sample" :style="referenceStyle">{{ sample }}</text>
    <view style="--tw-leading:48px;--tw-font-weight:400">
      <text class="probe-label">祖先变量不能穿过子节点 reset</text>
      <text id="probe-child" class="probe-sample text-header-md">{{ sample }}</text>
    </view>
    <text class="probe-label">独立字重：原始 / 插件 / 原生主题 / 原生常规</text>
    <text id="probe-weight-original" class="probe-weight text-header-md" style="font-size:32px;line-height:48px;--tw-font-weight:initial">{{ weightSample }}</text>
    <text id="probe-weight" class="probe-weight text-header-md" :class="{ 'font-normal': utilityOverride }" :style="weightStyle">{{ weightSample }}</text>
    <text id="probe-weight-reference" class="probe-weight" :style="weightReferenceStyle">{{ weightSample }}</text>
    <text id="probe-weight-regular" class="probe-weight" style="font-size:32px;line-height:48px;font-weight:400">{{ weightSample }}</text>
    <text class="probe-label">原生 reset / fallback 矩阵（缺失、initial、空值、有效值、自引用）</text>
    <text id="probe-normal" class="probe-sample" style="line-height:normal">{{ sample }}</text>
    <text v-for="item in fallbackCases" :id="item.id" :key="item.id" class="probe-sample" :class="item.className">{{ sample }}</text>
  </view>
</template>

<style>
.typography-probe {
  padding: 12px;
  color: #111;
  background: #fff;
}

.probe-label {
  display: block;
  font-size: 11px;
  line-height: 16px;
  color: #555;
}

.probe-controls {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.probe-controls button {
  margin: 0 4px 4px 0;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 20px;
}

.probe-sample {
  display: block;
  width: 280px;
  white-space: pre-wrap;
  font-size: 20px;
}

.probe-weight {
  display: inline-block;
  white-space: nowrap;
  font-family: Arial, sans-serif;
}

.probe-reset-initial { --probe-leading: initial; }
.probe-reset-empty { --probe-leading: ; }
.probe-reset-valid { --probe-leading: 44px; }
.probe-reset-cycle { --probe-leading: var(--probe-leading); }
.probe-fallback-literal { line-height: var(--probe-leading, 32px); }
.probe-fallback-nested { line-height: var(--probe-leading, var(--text-header-md--line-height)); }
</style>
