import path from 'node:path'
import { defineConfig } from '@tarojs/cli'
import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'

class FirstCompilation {
  apply(compiler) {
    compiler.hooks.done.tap('FirstCompilation', (stats) => {
      if (!stats.hasErrors() && stats.compilation.getAsset('app.json')) {
        console.log('WEAPP_1159_COMPILED')
      }
    })
  }
}

export default defineConfig({
  projectName: 'windows-default-utilities',
  date: '2026-09-06',
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  mini: {
    webpackChain(chain) {
      chain.plugin('weapp-tailwindcss').use(WeappTailwindcss, [{
        rem2rpx: true,
        cssEntries: [path.resolve(__dirname, '../src/app.css')],
      }])
      chain.plugin('first-compilation').use(FirstCompilation)
    },
  },
})
