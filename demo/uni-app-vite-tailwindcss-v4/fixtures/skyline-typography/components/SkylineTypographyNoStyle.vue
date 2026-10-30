<script setup lang="ts">
import SkylineTypographyScoped from './SkylineTypographyScoped.vue'

defineProps<{
  inlineStyle: string
  utilityOverride: boolean
  sample: string
  weightSample: string
}>()
</script>

<template>
  <view>
    <view style="--tw-leading:48px;--tw-font-weight:400">
      <text id="probe-no-style-header" class="block w-[280px] whitespace-pre-wrap text-header-md" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-no-style-small" class="block w-[280px] whitespace-pre-wrap text-probe-small" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-no-style-weight" class="text-header-md" :class="{ 'font-normal': utilityOverride }" :style="`display:inline-block;white-space:nowrap;font-family:Arial,sans-serif;font-size:32px;line-height:48px;${inlineStyle}`">{{ weightSample }}</text>
    </view>
    <SkylineTypographyScoped class="probe-scoped" :inline-style="inlineStyle" :utility-override="utilityOverride" :sample="sample" :weight-sample="weightSample" />
  </view>
</template>
