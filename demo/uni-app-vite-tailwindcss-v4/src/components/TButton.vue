<script setup lang="ts">
withDefaults(defineProps<{
  tClass?: string
  tClassContent?: string
}>(), {
  tClass: '',
  tClassContent: '',
})
</script>

<template>
  <button :class="tClass">
    <view :class="tClassContent"><slot /></view>
  </button>
</template>
