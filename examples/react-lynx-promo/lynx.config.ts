import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  output: {
    assetPrefix: '/',
    distPath: {
      root: 'dist',
    },
  },
  plugins: [pluginReactLynx({ engineVersion: '3.9' }), pluginLynxTailwindcss()],
})
