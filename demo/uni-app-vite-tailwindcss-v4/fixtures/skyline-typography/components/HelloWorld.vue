<template>
  <view class="hello-world-shell">
    Hello World
    <input v-model="model"></input>
  </view>
</template>

<script setup lang="ts">

const model = defineModel()

</script>

<style lang="scss" scoped>
@reference "../main.css";

.hello-world-shell {
  @apply flex items-center gap-2 rounded-[20rpx] bg-[#f8fafc] px-4 py-3 text-slate-700;
}
</style>
