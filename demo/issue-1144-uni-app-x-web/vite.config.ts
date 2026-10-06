import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { loadUniPlugin } from '../uni-app-x-plugin'
import { uniAppX } from 'weapp-tailwindcss/presets'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { issue1144IdentityPlugin } from './scripts/identity-plugin.mjs'
import { themeUtsPlugin } from './scripts/theme-plugin.mjs'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const mainCss = resolve(projectRoot, 'main.css')
const uni = loadUniPlugin(import.meta.url)

export default defineConfig({
	server: { host: '127.0.0.1' },
	plugins: [
		issue1144IdentityPlugin(projectRoot),
		uni(),
		WeappTailwindcss(
			uniAppX({
				base: projectRoot,
				cssEntries: [mainCss],
				customAttributes: {
					'*': ['pt']
				},
				rem2rpx: true
			})
		),
		themeUtsPlugin(mainCss, resolve(projectRoot, 'theme.uts'))
	]
})
