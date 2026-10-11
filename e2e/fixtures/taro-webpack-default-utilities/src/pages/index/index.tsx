import { View } from '@tarojs/components'

export default function Index() {
  return (
    <View className="flex text-slate-500 mt-2">
      <View className="h-8">h-8</View>
      <View className="h-20">h-20</View>
      <View className="h-50">h-50</View>
      <View className="h-[64rpx] bg-emerald-50/80">64rpx</View>
      <View className="h-[400rpx]">400rpx</View>
    </View>
  )
}
