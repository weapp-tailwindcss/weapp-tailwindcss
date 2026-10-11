import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import webpack from 'webpack'
import { resolveTaroPlatform } from 'weapp-tailwindcss/framework'
import { WeappTailwindcss, type UserDefinedOptions } from 'weapp-tailwindcss/webpack'
import devConfig from './dev'
import prodConfig from './prod'

const isWatchBuild = process.argv.includes('--watch') || process.argv.includes('-w')
const taroPlatform = resolveTaroPlatform()
const cssMode = process.env.E2E_TW_CSS_ENTRY_MODE === 'single' ? 'single' : 'isolated'
const projectRoot = path.resolve(__dirname, '..')
const cssEntries = cssMode === 'single'
  ? [path.resolve(projectRoot, 'src/app.single.css')]
  : [
      path.resolve(projectRoot, 'src/app.css'),
      path.resolve(projectRoot, 'src/sub-normal/index.css'),
      path.resolve(projectRoot, 'src/sub-independent/index.css'),
    ]

const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'
const generator = (officialPostcssParity ? false : {
  target: taroPlatform.isWeb ? 'web' : 'weapp',
  webCompat: taroPlatform.isWeb ? true : undefined,
  styleOptions: {
    px2rpx: true,
  },
}) satisfies UserDefinedOptions['generator']

function installWeappTailwindcss(chain: any) {
  chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
  if (cssMode === 'single') {
    chain.plugin('tailwind-single-css-entry').use(webpack.NormalModuleReplacementPlugin, [
      /\/app\.css$/,
      (resource: { context: string, request: string }) => {
        if (resource.context.replace(/\\/g, '/').endsWith('/src')) {
          resource.request = './app.single.css'
        }
      },
    ])
  }
  chain.merge({
    plugin: {
      install: {
        plugin: WeappTailwindcss,
        args: [
          {
            appType: 'taro',
            tailwindcssBasedir: projectRoot,
            cssEntries,
            cssSourceTrace: true,
            generator,
            styleInjector: false,
            customAttributes: {
              '*': [/^t-class(?:-.+)?$/],
            },
          } satisfies UserDefinedOptions,
        ],
      },
    },
  })
}

export default defineConfig<'webpack5'>(async (merge) => {
  process.env.BROWSERSLIST_ENV = isWatchBuild ? 'development' : 'production'

  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'subpackage-taro-webpack-react-tailwindcss-v4',
    date: '2026-06-27',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    plugins: ['@tarojs/plugin-html'],
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    compiler: {
      type: 'webpack5',
    },
    cache: {
      enable: false,
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        autoprefixer: {
          enable: true,
          config: {
            overrideBrowserslist: ['iOS >= 8', 'Android >= 4.1'],
          },
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain: installWeappTailwindcss,
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain: installWeappTailwindcss,
    },
    rn: {
      entry: 'app.rn',
      appName: 'taroSubpackageDemo',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
