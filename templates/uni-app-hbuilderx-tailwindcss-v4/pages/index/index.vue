<template>
	<view class="min-h-screen bg-[radial-gradient(circle_at_18%_20%,#e0f2fe,#fdf4ff_70%)] px-[32rpx] py-[40rpx] text-slate-800">
		<view class="rounded-[32rpx] border border-slate-100/70 bg-white/90 p-[40rpx] shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
			<view class="text-[24rpx] uppercase tracking-[6rpx] text-slate-400">HBuilderX · Tailwind CSS 4</view>
			<view class="mt-[16rpx] text-[52rpx] font-semibold leading-[1.12] text-slate-900">
				HBuilderX 里的清爽首页模板
			</view>
			<view class="mt-[20rpx] text-[28rpx] leading-relaxed text-slate-500">
				适合导入 HBuilderX 后直接预览，页面保留图片、任意值尺寸和小程序端样式转换验证。
			</view>
		</view>

		<view class="mt-[24rpx] rounded-[32rpx] border border-slate-100/70 bg-white/85 p-[32rpx] shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
			<view class="text-[24rpx] uppercase tracking-[6rpx] text-slate-400">预览区域</view>
			<image class="mt-[20rpx] h-[180rpx] w-[180rpx]" src="/static/logo.png"></image>
			<view class="mt-[20rpx] rounded-[24rpx] border border-sky-200/70 bg-sky-50/80 px-[24rpx] py-[20rpx] text-sky-700">
				<text class="text-[30rpx] font-semibold">{{ title }}</text>
				<view class="mt-[8rpx] text-[24rpx] opacity-80">Tailwind 任意尺寸与颜色已生效</view>
			</view>
		</view>
	</view>
</template>

<script>
	export default {
		data() {
			return {
				title: 'Weapp TailwindCSS'
			}
		},
		onLoad() {

		},
		methods: {

		}
	}
</script>

<style>

</style>
