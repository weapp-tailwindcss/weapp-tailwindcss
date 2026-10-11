import type { PackageJson } from 'pkg-types'
import type { FetchOptions, InitMode } from './npm'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { defu, setValue } from '@weapp-tailwindcss/shared'
import fs from 'fs-extra'
import path from 'pathe'
import { getDevDepsVersions } from './npm'

export interface CreateContextOptions {
  cwd: string
  pkgJsonBasename?: string
  postcssConfigBasename?: string
  tailwindConfigBasename?: string
  cssEntryBasename?: string
  sourceGlob?: string
  mode?: InitMode
  fetchOptions?: FetchOptions
}

export async function createContext(options: Required<CreateContextOptions>) {
  const { cwd, pkgJsonBasename, postcssConfigBasename, tailwindConfigBasename, cssEntryBasename, sourceGlob, mode, fetchOptions } = options
  const pkgJsonPath = path.resolve(cwd, pkgJsonBasename)
  if (await fs.exists(pkgJsonPath)) {
    const pkgJson: PackageJson = await fs.readJson(pkgJsonPath)
    const versions = await getDevDepsVersions(fetchOptions, mode)
    return {
      pkgJson,
      pkgJsonPath,
      cwd,
      versions,
      postcssConfigBasename,
      tailwindConfigBasename,
      cssEntryBasename,
      sourceGlob,
      mode,
      get type() {
        return pkgJson.type
      },
    }
  }
  else {
    logger.warn('当前目录下不存在 `package.json` 文件，初始化脚本将被跳过，请执行 `pnpm init` 或手动创建 `package.json` 后重试 ')
  }
}

export type Context = Exclude<Awaited<ReturnType<typeof createContext>>, undefined>

export async function updatePackageJson(ctx: Context) {
  for (const [key, value] of Object.entries(ctx.versions)) {
    setValue(ctx.pkgJson, `devDependencies.${key}`, value)
  }
  await fs.writeJSON(ctx.pkgJsonPath, ctx.pkgJson, { spaces: 2 })
}

async function writeIfMissing(file: string, data: string) {
  if (await fs.exists(file)) {
    return false
  }
  await fs.outputFile(file, data)
  return true
}

export async function touchPostcssConfig(ctx: Context) {
  const data = `${ctx.type === 'module' ? 'export default ' : 'module.exports = '}{
  plugins: {
    // Tailwind CSS 由 weapp-tailwindcss 生成模式接管，这里不要再注册 tailwindcss
    // 假如框架已经内置了 \`autoprefixer\`，可以去除下一行
    autoprefixer: {},
  },
}
`

  return await writeIfMissing(path.resolve(ctx.cwd, ctx.postcssConfigBasename), data)
}

export async function touchTailwindConfig(ctx: Context) {
  const data = `/** @type {import('tailwindcss').Config} */
${ctx.type === 'module' ? 'export default ' : 'module.exports = '}{
  // 这里给出了一份 uni-app /taro 通用示例，具体要根据你自己项目的目录结构进行配置
  // 不在 content 包括的文件内，你编写的 class，是不会生成对应的css工具类的
  content: ['./public/index.html', './src/**/*.{wxml,html,js,ts,jsx,tsx,vue}'],
  // 其他配置项
  // ...
  corePlugins: {
    // 小程序不需要 preflight 和 container，因为这主要是给 h5 的，如果你要同时开发小程序和 h5 端，你应该使用环境变量来控制它
    preflight: false,
    container: false,
  },
}
`
  return await writeIfMissing(path.resolve(ctx.cwd, ctx.tailwindConfigBasename), data)
}

export async function touchCssEntry(ctx: Context) {
  const data = `@import "tailwindcss";
@source "${ctx.sourceGlob}";
`
  return await writeIfMissing(path.resolve(ctx.cwd, ctx.cssEntryBasename), data)
}

export function getInitDefaults() {
  return {
    cwd: process.cwd(),
    postcssConfigBasename: 'postcss.config.js',
    tailwindConfigBasename: 'tailwind.config.js',
    cssEntryBasename: 'src/app.css',
    sourceGlob: './**/*.{html,js,ts,jsx,tsx,vue,wxml}',
    pkgJsonBasename: 'package.json',
    mode: 'v4' as InitMode,
  }
}

export async function init(options?: CreateContextOptions) {
  const opts = defu<
    Required<CreateContextOptions>,
    Partial<CreateContextOptions>[]
  >(options, getInitDefaults())
  const ctx = await createContext(opts)
  if (ctx) {
    await updatePackageJson(ctx)
    logger.success('`package.json` 文件修改完成！')
    if (ctx.mode === 'legacy') {
      if (await touchPostcssConfig(ctx)) {
        logger.success('`postcss.config.js` 文件创建完成！')
      }
      if (await touchTailwindConfig(ctx)) {
        logger.success('`tailwind.config.js` 文件创建完成！')
      }
      logger.success('`weapp-tailwindcss` 旧版初始化完成！')
      return
    }
    if (await touchCssEntry(ctx)) {
      logger.success(`\`${ctx.cssEntryBasename}\` 文件创建完成！`)
    }
    logger.success('`weapp-tailwindcss` v5 初始化完成！请将 WeappTailwindcss() 注册到项目构建器，并确认入口 CSS 被实际引入。')
  }
}
