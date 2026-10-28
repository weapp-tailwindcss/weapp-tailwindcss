import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import { WeappTailwindcss, type UserDefinedOptions } from 'weapp-tailwindcss/vite'
import path from 'node:path'
import devConfig from './dev'
import prodConfig from './prod'

const isWebTarget = process.env.TARO_ENV === 'h5' || process.env.TARO_ENV === 'harmony-hybrid'
const isNativeTarget = process.env.TARO_ENV === 'rn' || process.env.TARO_ENV === 'jdrn'
const webBaseFontSize = 16
const tailwindcssOptions: UserDefinedOptions = {
  disabled: isNativeTarget,
  rem2rpx: !isWebTarget,
  generator: {
    target: isWebTarget ? 'web' : 'weapp',
    webCompat: isWebTarget ? true : undefined,
    styleOptions: isWebTarget ? undefined : { px2rpx: true },
  },
  cssOptions: isWebTarget ? {
    rem2rpx: false,
    px2rpx: false,
    cssSelectorReplacement: { root: false, universal: false },
    // 对齐生成器的 32rpx=1rem，并让 Taro 750 设计宽下的 40px/40rpx 均为 1.25rem。
    unitConversion: { rules: [{ from: 'rpx', to: 'rem', factor: 1 / (webBaseFontSize * 2) }] },
  } : undefined,
}

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'vite'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'vite'> = {
    projectName: 'myApp',
    date: '2025-2-23',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: {
      type: 'vite',
      vitePlugins: [
        WeappTailwindcss({
          ...tailwindcssOptions,
          tailwindcssBasedir: process.cwd(),
          cssEntries: [
            path.resolve(__dirname, '../src/app.css')
          ]
        })
      ]
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',

      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        pxtransform: {
          config: { baseFontSize: webBaseFontSize, minRootSize: webBaseFontSize, maxRootSize: webBaseFontSize * 2 },
        },
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }

  process.env.BROWSERSLIST_ENV = process.env.NODE_ENV

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
