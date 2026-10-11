import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseThemeTokens(css) {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
	const tokens = new Map()
	let offset = 0

	while (true) {
		const start = source.indexOf('@theme', offset)
		if (start < 0) break

		const open = source.indexOf('{', start)
		const close = source.indexOf('}', open + 1)
		if (open < 0 || close < 0) throw new Error('@theme 块缺少结束大括号')

		// ponytail: 当前主题值不支持分号；需要 data URL 等复杂值时再改用 CSS AST。
		for (const declaration of source.slice(open + 1, close).split(';')) {
			const colon = declaration.indexOf(':')
			if (colon < 0) continue

			const name = declaration.slice(0, colon).trim()
			const value = declaration.slice(colon + 1).trim()
			if (!name.startsWith('--') || name.includes('*')) continue
			if (value === '') throw new Error(`主题变量 ${name} 的值不能为空`)
			tokens.set(name, value)
		}

		offset = close + 1
	}

	if (tokens.size === 0) throw new Error('main.css 的 @theme 中没有可用主题变量')
	return tokens
}

export function parseThemeClasses(css) {
	const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
	const themes = new Map()

	for (const match of source.matchAll(/\.([\w-]+)\s*\{([^{}]*)\}/g)) {
		const values = new Map()
		for (const declaration of match[2].split(';')) {
			const colon = declaration.indexOf(':')
			if (colon < 0) continue

			const name = declaration.slice(0, colon).trim()
			const value = declaration.slice(colon + 1).trim()
			if (!name.startsWith('--theme-')) continue
			if (value === '') throw new Error(`主题变量 ${name} 的值不能为空`)
			values.set(name, value)
		}
		if (values.size > 0) themes.set(match[1], values)
	}

	if (themes.size === 0) throw new Error('main.css 中没有包含 --theme-* 变量的主题类')
	return themes
}

export function renderThemeUts(tokens, themes) {
	const entries = [...tokens]
		.map(([name, value]) => `\t[${JSON.stringify(name)}, ${JSON.stringify(value)}]`)
		.join(',\n')
	const themeEntries = [...themes]
		.flatMap(([themeClass, values]) => [...values]
			.map(([name, value]) => `\t[${JSON.stringify(`${themeClass}:${name}`)}, ${JSON.stringify(value)}]`))
		.join(',\n')

	return [
		'// 此文件由 main.css 自动生成，请勿手动修改。',
		"import { computed } from 'vue'",
		"import type { ComputedRef } from 'vue'",
		"import { useTheme } from '@/stores/theme.uts'",
		'',
		'const theme = useTheme()',
		'const themeValues: Map<string, string> = new Map<string, string>([',
		entries,
		'])',
		'',
		'const themeClassValues: Map<string, string> = new Map<string, string>([',
		themeEntries,
		'])',
		'',
		'export function getThemeValue(name: string): ComputedRef<string> {',
		'\treturn computed((): string => {',
			'\t\tconst classValue = themeClassValues.get(theme.themeClass + ":" + name)',
		'\t\tif (classValue != null) return classValue',
		'\t\tconst value = themeValues.get(name)',
		'\t\tif (value == null) {',
		"\t\t\tconsole.warn('未定义的主题变量：' + name)",
			"\t\t\treturn ''",
		'\t\t}',
		'\t\treturn value',
		'\t})',
		'}',
		''
	].join('\n')
}

export function themeUtsPlugin(input, output) {
	const inputPath = resolve(input)
	const sync = () => {
		const css = readFileSync(inputPath, 'utf8')
		if (!css.includes('@theme')) return
		const next = renderThemeUts(parseThemeTokens(css), parseThemeClasses(css))
		const current = existsSync(output) ? readFileSync(output, 'utf8') : ''
		if (next !== current) writeFileSync(output, next)
	}

	sync()
	const syncChangedFile = (file) => {
		if (resolve(file) === inputPath) sync()
	}

	return {
		name: 'theme-uts',
		buildStart() {
			this.addWatchFile(inputPath)
		},
		watchChange(file) {
			syncChangedFile(file)
		},
		handleHotUpdate(context) {
			syncChangedFile(context.file)
		}
	}
}

async function selfCheck() {
	const { compile } = await import('tailwindcss')
	const sampleCss = `
		.light { --theme-page: #ffffff; }
		.dark { --theme-page: #111111; }
		@theme { --radius-xl: 12px; --text-sm--line-height: 20px; }
	`
	const sampleTokens = parseThemeTokens(sampleCss)
	const sampleThemes = parseThemeClasses(sampleCss)
	assert.equal(sampleTokens.get('--radius-xl'), '12px')
	assert.equal(sampleThemes.get('dark').get('--theme-page'), '#111111')
	const sampleUts = renderThemeUts(sampleTokens, sampleThemes)
	assert.match(sampleUts, /\["--text-sm--line-height", "20px"\]/)
	assert.match(sampleUts, /\["dark:--theme-page", "#111111"\]/)
	assert.match(sampleUts, /new Map<string, string>/)
	assert.match(sampleUts, /ComputedRef<string>/)
	assert.match(sampleUts, /themeClassValues\.get\(theme\.themeClass/)
	assert.match(sampleUts, /console\.warn\('未定义的主题变量：' \+ name\)/)
	assert.doesNotMatch(sampleUts, /throw new Error\('未定义的主题变量/)

	const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const mainCss = readFileSync(resolve(projectRoot, 'main.css'), 'utf8')
	const themeStore = readFileSync(resolve(projectRoot, 'stores/theme.uts'), 'utf8')
	const pageSource = readFileSync(resolve(projectRoot, 'pages/index/index.uvue'), 'utf8')
	const parsedThemes = parseThemeClasses(mainCss)
	const themeClasses = ['light', 'dark', 'ocean-light', 'ocean-dark']
	const variables = [
		'--theme-page',
		'--theme-surface',
		'--theme-surface-muted',
		'--theme-content',
		'--theme-content-muted',
		'--theme-line',
		'--theme-primary',
		'--theme-secondary',
		'--theme-on-primary'
	]

	for (const themeClass of themeClasses) {
		const block = mainCss.match(new RegExp(`\\.${themeClass}\\s*\\{([\\s\\S]*?)\\}`))
		assert.ok(block, `缺少根主题类：${themeClass}`)
		for (const variable of variables) {
			assert.match(block[1], new RegExp(`${variable}\\s*:`), `${themeClass} 缺少变量：${variable}`)
		}
	}
	assert.equal(parsedThemes.get('light').get('--theme-page'), '#f7f8fa')
	assert.equal(parsedThemes.get('dark').get('--theme-page'), '#111318')

	const candidates = new Map([
		['bg-page', '--theme-page'],
		['bg-surface', '--theme-surface'],
		['bg-surface-muted', '--theme-surface-muted'],
		['text-content', '--theme-content'],
		['text-content-muted', '--theme-content-muted'],
		['border-line', '--theme-line'],
		['bg-primary', '--theme-primary'],
		['bg-secondary', '--theme-secondary'],
		['text-on-primary', '--theme-on-primary']
	])
	const themeBlocks = [...mainCss.matchAll(/@theme(?:\s+inline)?\s*\{[\s\S]*?\}/g)]
		.map((match) => match[0])
		.join('\n')
	const compiler = await compile(`${themeBlocks}\n@tailwind utilities;`)
	const output = compiler.build([...candidates.keys()])
	for (const [className, variable] of candidates) {
		assert.ok(output.includes(`.${className}`), `Tailwind 未生成语义类：${className}`)
		assert.ok(output.includes(`var(${variable})`), `${className} 未保留 CSS 变量：${variable}`)
	}

	assert.match(themeStore, /themeClass:\s*ThemeClass/)
	assert.match(pageSource, /theme\.themeClass/)
	assert.doesNotMatch(`${mainCss}\n${themeStore}\n${pageSource}`, /(?:bg|text|border)-theme-/)
	assert.doesNotMatch(`${themeStore}\n${pageSource}`, /theme\.palette|palette:/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	selfCheck().catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
}
