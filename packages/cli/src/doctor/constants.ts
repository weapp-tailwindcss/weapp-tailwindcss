export const CONFIG_FILES = {
  tailwind: [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts',
  ],
  postcss: [
    'postcss.config.js',
    'postcss.config.cjs',
    'postcss.config.mjs',
    'postcss.config.ts',
  ],
  vite: ['vite.config.js', 'vite.config.mjs', 'vite.config.ts'],
  webpack: ['webpack.config.js', 'webpack.config.cjs', 'webpack.config.ts'],
}

export const FRAMEWORK_DEPS: Array<[string, string]> = [
  ['@tarojs/taro', 'Taro'],
  ['@dcloudio/uni-app', 'uni-app'],
  ['@mpxjs/core', 'MPX'],
  ['remax', 'Remax'],
]
