import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import {WeappTailwindcss,type UserDefinedOptions} from 'weapp-tailwindcss/webpack'
import path from 'node:path'
import devConfig from './dev'
import prodConfig from './prod'
import { WebRpxToRemPlugin } from './webpack-web-units'

const isWebTarget = process.env.TARO_ENV === 'h5' || process.env.TARO_ENV === 'harmony-hybrid'
const isNativeTarget = process.env.TARO_ENV === 'rn' || process.env.TARO_ENV === 'jdrn'
const webBaseFontSize = 16
const tailwindcssOptions: UserDefinedOptions = {
  disabled: isNativeTarget,
  rem2rpx: !isWebTarget,
  generator: {
    target: isWebTarget ? 'web' : 'weapp',
    webCompat: isWebTarget ? true : undefined,
  },
  cssOptions: isWebTarget ? {
    rem2rpx: false,
    px2rpx: false,
    cssSelectorReplacement: { root: false, universal: false },
  } : undefined,
}

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
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
    compiler: 'webpack5',
    cache: {
      enable: false // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
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
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.merge({
          plugin: {
            install: {
              plugin: WeappTailwindcss,
              args: [
                {
                  ...tailwindcssOptions,
                  cssEntries:[
                    path.resolve(__dirname,'../src/app.css')
                  ]
                } satisfies UserDefinedOptions
              ]
            }
          }
        })
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
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
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.plugin('weapp-tailwindcss').use(WeappTailwindcss, [
          {
            ...tailwindcssOptions,
            cssEntries:[
              path.resolve(__dirname,'../src/app.css')
            ]
          } satisfies UserDefinedOptions
        ])
        if (isWebTarget) {
          chain.plugin('web-rpx-to-rem').use(WebRpxToRemPlugin, [webBaseFontSize])
        }
      }
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
