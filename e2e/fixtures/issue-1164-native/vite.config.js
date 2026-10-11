import { defineConfig } from 'vite'
import uniModule from '@dcloudio/vite-plugin-uni'

const uni = uniModule.default ?? uniModule
export default defineConfig({ plugins: [uni()] })
