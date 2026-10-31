<script setup lang="ts">
defineProps<{
  inlineStyle: string
  utilityOverride: boolean
  sample: string
  weightSample: string
}>()
</script>

<template>
  <view class="external-fixture">
    <view style="--tw-leading:48px;--tw-font-weight:400">
      <text id="probe-external-header" class="block w-[280px] whitespace-pre-wrap text-header-md" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-external-small" class="block w-[280px] whitespace-pre-wrap text-probe-small" :class="{ 'leading-[36px] font-normal': utilityOverride }" :style="inlineStyle">{{ sample }}</text>
      <text id="probe-external-weight" class="text-header-md" :class="{ 'font-normal': utilityOverride }" :style="`display:inline-block;white-space:nowrap;font-family:Arial,sans-serif;font-size:32px;line-height:48px;${inlineStyle}`">{{ weightSample }}</text>
    </view>
  </view>
</template>

<style src="./skyline-typography/external.css"></style>
