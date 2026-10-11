import { defineConfig } from 'vite'
import { loadUniPlugin } from '../uni-app-x-plugin'
import { debugX } from '@weapp-tailwindcss/debug-uni-app-x'
import parity from '../official-postcss-parity-plugin.cjs'
import { uniAppX } from 'weapp-tailwindcss/presets'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const uni = loadUniPlugin(import.meta.url)
const projectRoot = dirname(fileURLToPath(import.meta.url))
const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'
const isNativeApp = process.env.UNI_UTS_PLATFORM?.startsWith('app-') === true
const weappTailwindcssPlugins = WeappTailwindcss(
  uniAppX({
    base: projectRoot,
    componentLocalStyles: {
      enabled: true,
      onlyWhenStyleIsolationVersion2: false,
    },
    cssEntries: [
      resolve(projectRoot, 'main.css'),
      ...isNativeApp ? [] : [resolve(projectRoot, 'main.iconify.css')],
    ],
    cssSourceTrace: true,
    rem2rpx: true,
    customAttributes: {
      '*': [/^t-class(?:-.+)?$/],
      'a-navbar': ['leftClass', 'rightClass'],
    },
    generator: officialPostcssParity ? false : undefined,
  }),
) ?? []
const debugUniAppXPlugins = debugX({
  cwd: projectRoot,
})

export default defineConfig({
  plugins: [
    uni(),
    ...weappTailwindcssPlugins,
    ...debugUniAppXPlugins,
  ],
  css: {
    postcss: {
      plugins: parity.createOfficialPostcssParityPlugins(),
    },
  },
})
