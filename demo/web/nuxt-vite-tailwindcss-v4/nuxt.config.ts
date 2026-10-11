import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  css: [
    '~/assets/css/tailwind.css',
  ],
  nitro: {
    // Nuxt 4.6.0 在 Windows 上需要把 Nuxt renderer 内联，避免 Nitro 以反斜杠路径匹配失败。
    externals: {
      inline: [/[\\/]node_modules[\\/]nuxt[\\/]dist[\\/]/],
    },
  },
  vite: {
    plugins: [
      ...(
        WeappTailwindcss({
          tailwindcssBasedir: projectRoot,
          cssEntries: [
            resolve(projectRoot, 'app/assets/css/tailwind.css'),
          ],
          generator: {
            target: 'web',
            webCompat: {
              preset: 'legacy-web',
            },
          },
        }) ?? []
      ),
    ],
  },
})
