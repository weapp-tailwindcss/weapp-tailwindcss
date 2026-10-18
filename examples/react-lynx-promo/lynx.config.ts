import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  output: {
    assetPrefix: '/',
    // 将演示头像随 bundle 内联，离线原生宿主无需额外资源服务。
    dataUriLimit: 64 * 1024,
    distPath: {
      root: 'dist',
    },
  },
  plugins: [
    pluginReactLynx({ engineVersion: '3.9' }),
    pluginLynxTailwindcss(),
  ],
})
