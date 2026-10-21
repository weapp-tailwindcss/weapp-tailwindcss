import { taroMiniCase } from './taro-mini'

/** 已维护 demo 的有限小程序矩阵；登记真实入口不代表构建已经通过。 */
export function retainedTaroMiniCases() {
  return ['taro-vite-react-tailwindcss-v4', 'taro-vite-vue3-tailwindcss-v4', 'taro-webpack-react-tailwindcss-v4', 'taro-webpack-vue3-tailwindcss-v4'].flatMap((project) => {
    const color = project.includes('webpack') ? '534312' : '123456'
    return (['weapp', 'swan', 'alipay', 'tt', 'qq', 'jd'] as const).map(platform => taroMiniCase({
      project,
      packageName: `@weapp-tailwindcss-demo/${project}`,
      platform,
      styleContains: [`.bg-_b_h${color}_B`, '.text-_b_hfff_B'],
      textContains: [`bg-_b_h${color}_B`, 'text-_b_hfff_B'],
      status: 'local',
      reason: '本地完整矩阵执行实际平台构建，独立检查样式后缀、模板、转义类与未处理指令；不以登记或其它平台构建代证。',
    }))
  })
}
