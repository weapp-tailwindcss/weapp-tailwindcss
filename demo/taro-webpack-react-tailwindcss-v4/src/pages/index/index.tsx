import { View, Text } from '@tarojs/components'
import './index.css'
import { Button as NutButton } from '@nutui/nutui-react-taro'

export default function Index() {
  return (
    <>
      <View className='bg-[#534312] text-[#fff] text-[100rpx]'>
        <Text>Hello world!</Text>
      </View>
      <View id='tw-watch-dom' className='bg-purple-800 text-pink-200'>
        11
      </View>
      <View data-issue-1166='infinity-radius' className='rounded-full bg-blue-500 px-4 py-2'>
        无限圆角兼容旧版 PostCSS
        <View className='rounded-t-full rounded-s-full bg-blue-200'>方向与逻辑圆角</View>
      </View>
      <View className='weapp-tw-nutui-react-demo mt-4' data-issue-850-import-order='nutui-first'>
        <View data-issue-850-cascade='normal'>
          <NutButton className='rounded-full' type='primary'>Tailwind wins by source order (NutUI first)</NutButton>
        </View>
        <View data-issue-850-cascade='important' className='mt-2'>
          <NutButton className='rounded-full!' type='primary'>Tailwind wins with important</NutButton>
        </View>
      </View>
      <View className='theme-mode-demo mt-4 rounded bg-white px-4 py-3 text-slate-900 system-dark:bg-slate-900 system-dark:text-slate-100 dark:bg-zinc-900 dark:text-zinc-50'>
        Taro Webpack React Tailwind CSS v4 system dark
        <View className='theme-dark mt-2 rounded bg-white px-3 py-2 text-slate-900 dark:bg-zinc-950 dark:text-zinc-50'>
          Taro Webpack React Tailwind CSS v4 manual dark
        </View>
      </View>
      <View t-class='bg-[#0977ee] text-[31rpx]' t-class-content='px-[29rpx]'>issue 977 t-class</View>
      <View className='h-14 bg-gradient-to-r from-cyan-500 to-blue-500'></View>
      <NutButton>Share</NutButton>
    </>

  )
}
