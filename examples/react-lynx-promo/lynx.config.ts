import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginLynxTailwindcss } from '@weapp-tailwindcss/lynx'

export default defineConfig({
  output: {
    assetPrefix: '/',
    // 保留真实图片资源文件，由开发服务器或原生宿主资源加载器读取。
    dataUriLimit: 0,
    distPath: {
      root: 'dist',
    },
  },
  plugins: [
    pluginReactLynx({ engineVersion: '3.9' }),
    pluginLynxTailwindcss(),
  ],
})
