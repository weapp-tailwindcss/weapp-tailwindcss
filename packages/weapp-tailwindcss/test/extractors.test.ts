import { splitCode } from '@weapp-tailwindcss/shared/extractors'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'

describe('extractorSplit', () => {
  it('uses the candidate token splitter without allowDoubleQuotes gating', () => {
    const code = 'after:content-["*"] after:content-[\'Hello_World\'] text-red-500'

    expect(splitCandidateTokens(code)).toEqual([
      'after:content-["*"]',
      'after:content-[\'Hello_World\']',
      'text-red-500',
    ])
    expect(splitCode(code, false)).toEqual(splitCandidateTokens(code))
    expect(splitCode(code, true)).toEqual(splitCandidateTokens(code))
  })

  it('common case ', () => {
    let code = ''
    // const arr = []
    function extract(allowDoubleQuotes = false) {
      return [...(splitCode(code, allowDoubleQuotes) || [])]
    }

    code = 'webpackJsonp'
    expect(extract()).toEqual(['webpackJsonp'])

    code = 'webpack/container/entry/taro_app_library'
    expect(extract()).toEqual(['webpack/container/entry/taro_app_library'])

    code = 'vendors-node_modules_taro_weapp_prebundle_chunk-LNJCN3VW_js'
    expect(extract()).toEqual(['vendors-node_modules_taro_weapp_prebundle_chunk-LNJCN3VW_js'])

    code = 'w-full bg-indigo-400 bg-[url(\'https://xxx.com/xx.webp\')] bg-bottom bg-contain bg-no-repeat'
    expect(extract().length).toBe(6)

    code = 'after:border-none after:content-[\'Hello_World\'] a'
    expect(extract().length).toBe(3)
    // 双引号任意值默认可识别，allowDoubleQuotes 仅保留兼容旧配置
    code = 'after:content-["*"] after:ml-0.5 after:text-red-500 b'
    expect(extract(true).length).toBe(4)

    code = 'after:content-["的撒的撒"] after:ml-0.5 after:text-red-500'
    expect(extract(true).length).toBe(3)

    code = 'after:content-[\'的撒的撒\'] after:ml-0.5 after:text-red-500'
    expect(extract().length).toBe(3)

    code = '<view class="p-[20px] -mt-2 mb-[-20px]">'
    const res = extract()
    expect(res.length).toBe(6)

    code = 'border-b-[rgba(0,0,0,0.1)]\\ntext-base\\tfont-bold'
    expect(extract()).toEqual(['border-b-[rgba(0,0,0,0.1)]', 'text-base', 'font-bold'])

    code
      = '<view class="p-[20px] -mt-2 mb-[-20px]">p-[20px] -mt-2 mb-[-20px] margin的jit 不能这么写 -m-[20px]</view><view class="space-y-[1.6rem]"><view class="w-[300rpx] text-black text-opacity-[0.19]">w-[300rpx] text-black text-opacity-[0.19]</view><view class="min-w-[300rpx] max-h-[100px] text-[20px] leading-[0.9]">min-w-[300rpx] max-h-[100px] text-[20px] leading-[0.9]</view><view class="max-w-[300rpx] min-h-[100px] text-[#dddddd]">max-w-[300rpx] min-h-[100px] text-[#dddddd]</view><view class="flex items-center justify-center h-[100px] w-[100px] rounded-[40px] bg-[#123456] bg-opacity-[0.54] text-[#ffffff]"> Hello</view><view class="border-[10px] border-[#098765] border-solid border-opacity-[0.44]">border-[10px] border-[#098765] border-solid border-opacity-[0.44]</view><view class="grid grid-cols-3 divide-x-[10px] divide-[#010101] divide-solid"><view>1</view><view>2</view><view>3</view></view><view class="w-32 py-2 rounded-md font-semibold text-white bg-pink-500 ring-4 ring-pink-300"> Default </view></view><view class="test">test</view>'
    const res0 = extract()
    expect(res0.length).toBe(80)
  })
})
