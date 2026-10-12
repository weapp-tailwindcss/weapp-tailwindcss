import { resolve, win32 } from 'node:path'
import process from 'node:process'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'
import { WeappTailwindcss, UserDefinedOptions } from 'weapp-tailwindcss/webpack'
import { resolveTaroPlatform } from 'weapp-tailwindcss/framework'
import parity from '../../official-postcss-parity-plugin.cjs'

const isWatchBuild = process.argv.includes('--watch') || process.argv.includes('-w')
const tailwindcssV4GradientFallback = process.env.WEAPP_TW_V4_GRADIENT_FALLBACK === '1'
const taroPlugins = [
  ...(process.env.WEAPP_TW_TARO_PLUGIN_HTML === '0' ? [] : ['@tarojs/plugin-html']),
  // '@tarojs/plugin-platform-harmony-hybrid',
]
const cssOptions = {
  tailwindcssV4GradientFallback,
  preserveWebkitProperties: ['-webkit-tap-highlight-color'],
} satisfies UserDefinedOptions['cssOptions']
const projectRoot = resolve(__dirname, '..')
const cssEntries = [
  resolve(projectRoot, 'src/app.css'),
  resolve(projectRoot, 'src/sub-normal/pages/index.css'),
  resolve(projectRoot, 'src/sub-independent/pages/index.css'),
  resolve(projectRoot, 'src/pages/issue-998/index.css'),
]

const taroPlatform = resolveTaroPlatform()
const webCompat = taroPlatform.isWeb
  ? process.env.WEAPP_TW_WEB_COMPAT !== '0'
  : undefined
const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'
const generator = (officialPostcssParity ? false : {
  target: taroPlatform.isWeb || process.env.TARO_ENV === 'harmony' || process.env.TARO_ENV === 'harmony-hybrid'
    ? 'web'
    : 'weapp',
  webCompat,
  styleOptions: {
    cssOptions,
  },
}) satisfies UserDefinedOptions['generator']

function disableWebpackDevServerClientOverlay(chain: any) {
  chain.devServer.set('client', {
    ...(chain.devServer.get('client') ?? {}),
    overlay: false,
  })
}

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  process.env.BROWSERSLIST_ENV = isWatchBuild
    ? 'development'
    : 'production'

  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'taro-webpack-react-tailwindcss-v4',
    date: '2025-2-23',
    designWidth: taroPlatform.isWeb
      ? 750
      : (input) => {
          const file = typeof input?.file === 'string' ? win32.resolve(projectRoot, input.file) : ''
          if (win32.dirname(file) === win32.resolve(projectRoot, 'src/pages/issue-998')) {
            return 375
          }
          // 配置 NutUI 375 尺寸
          // @ts-ignore
          if (file.includes('@nutui')) {
            return 375
          }
          // 全局使用 Taro 默认的 750 尺寸
          return 750
        },
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    plugins: taroPlugins,
    sourceRoot: 'src',
    outputRoot: 'dist',
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
      type: 'webpack5',
      prebundle: {
        enable: false,
        exclude: ['@nutui/nutui-react-taro', '@nutui/icons-react-taro'],
      },
    },
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
        autoprefixer: {
          enable: true,
          config: {
            overrideBrowserslist: ['iOS >= 8', 'Android >= 4.1'],
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
                  appType: 'taro',
                  tailwindcssBasedir: projectRoot,
                  cssSourceTrace: true,
                  cssEntries,
                  cssOptions,
                  generator,
                  postcssOptions: parity.createOfficialPostcssParityPostcssOptions(),
                  styleInjector: false,
                  customAttributes: {
                    '*': [/^t-class(?:-.+)?$/],
                  },
                  // before 2248
                  // after 309
                  // cssCalc: ['--nutui']
                } satisfies UserDefinedOptions
              ]
            }
          }
        })
      },
    },
    h5: {
      // Taro webpack runner 不消费 BROWSER，需显式传入 WDS 的自动打开边界。
      ...(process.env.BROWSER === 'none' ? { devServer: { open: false } } : {}),
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
        chain.plugins.delete('webpackbar')
        disableWebpackDevServerClientOverlay(chain)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        chain.merge({
          plugin: {
            install: {
              plugin: WeappTailwindcss,
              args: [
                {
                  appType: 'taro',
                  tailwindcssBasedir: projectRoot,
                  cssSourceTrace: true,
                  cssEntries,
                  cssOptions,
                  generator,
                  postcssOptions: parity.createOfficialPostcssParityPostcssOptions(),
                  styleInjector: false,
                  customAttributes: {
                    '*': [/^t-class(?:-.+)?$/],
                  },
                } satisfies UserDefinedOptions
              ]
            }
          }
        })
      }
    },
    rn: {
      entry: 'app.rn',
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
