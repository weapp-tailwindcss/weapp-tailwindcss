<script setup lang="ts">
import SkylineTypographyExternal from './SkylineTypographyExternal.vue'

defineProps<{
  inlineStyle: string
  utilityOverride: boolean
  sample: string
  weightSample: string
}>()
</script>

<template>
  <view class="scoped-fixture">
    <view style="--tw-leading:48px;--tw-font-weight:400">
      <text id="probe-scoped-header" class="block w-[280px] whitespace-pre-wrap text-header-md" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-scoped-small" class="block w-[280px] whitespace-pre-wrap text-probe-small" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-scoped-weight" class="text-header-md" :class="{ 'font-normal': utilityOverride }" :style="`display:inline-block;white-space:nowrap;font-family:Arial,sans-serif;font-size:32px;line-height:48px;${inlineStyle}`">{{ weightSample }}</text>
    </view>
    <SkylineTypographyExternal class="probe-external" :inline-style="inlineStyle" :utility-override="utilityOverride" :sample="sample" :weight-sample="weightSample" />
  </view>
</template>

<style scoped>
.scoped-fixture {
  display: block;
}
</style>
