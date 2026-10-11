import type { DoctorCheck, DoctorCheckStatus, DoctorOptions, DoctorReport, PackageJson } from './doctor/types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import semver from 'semver'
import { WEAPP_TW_REQUIRED_NODE_VERSION_RANGE } from './constants'
import { CONFIG_FILES, FRAMEWORK_DEPS } from './doctor/constants'
import {
  extractConfiguredCssEntries,
  extractConfiguredOption,
  extractCssSources,
  extractGeneratorTarget,
  findConfiguredTailwindOwners,
  readConfigText,
  resolveSourceProbePath,
  SUPPORTED_APP_TYPES,
  SUPPORTED_GENERATOR_TARGETS,
} from './doctor/semantics'

function tryReadJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  }
  catch {
    return undefined
  }
}

function findFirstExisting(cwd: string, files: string[]) {
  return files.find(file => existsSync(path.join(cwd, file)))
}

function readProjectPackageJson(cwd: string) {
  return tryReadJson<PackageJson>(path.join(cwd, 'package.json'))
}

function readDependencyVersion(cwd: string, packageName: string) {
  try {
    const requireFromCwd = createRequire(path.join(cwd, 'package.json'))
    const packageJsonPath = requireFromCwd.resolve(`${packageName}/package.json`)
    return tryReadJson<{ version?: string }>(packageJsonPath)?.version
  }
  catch {
    return undefined
  }
}

function collectDependencySpecs(pkg: PackageJson | undefined) {
  return {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    ...(pkg?.optionalDependencies ?? {}),
    ...(pkg?.peerDependencies ?? {}),
  }
}

function detectPackageManager(cwd: string, pkg: PackageJson | undefined) {
  if (pkg?.packageManager) {
    return pkg.packageManager
  }
  if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }
  if (existsSync(path.join(cwd, 'package-lock.json'))) {
    return 'npm'
  }
  if (existsSync(path.join(cwd, 'yarn.lock'))) {
    return 'yarn'
  }
  return undefined
}

function detectFrameworks(deps: Record<string, string>) {
  return FRAMEWORK_DEPS
    .filter(([dependency]) => dependency in deps)
    .map(([, label]) => label)
}

function addCheck(checks: DoctorCheck[], check: DoctorCheck) {
  checks.push({
    ...check,
    code: check.code ?? check.id,
    evidence: check.evidence ?? [],
  })
}

function summarizeChecks(checks: DoctorCheck[]): Record<DoctorCheckStatus, number> {
  return checks.reduce<Record<DoctorCheckStatus, number>>((summary, check) => {
    summary[check.status] += 1
    return summary
  }, { ok: 0, warn: 0, error: 0, info: 0 })
}

function hasDependency(deps: Record<string, string>, packageName: string) {
  return packageName in deps
}

function getMajorVersion(version: string | undefined) {
  if (!version) {
    return undefined
  }
  return semver.parse(version)?.major
}

function getDependencyMajor(deps: Record<string, string>, packageName: string) {
  const spec = deps[packageName]
  return spec ? semver.minVersion(spec)?.major : undefined
}

export function createDoctorReport(options: DoctorOptions = {}): DoctorReport {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const pkg = readProjectPackageJson(cwd)
  const deps = collectDependencySpecs(pkg)
  const checks: DoctorCheck[] = []
  const packageManager = detectPackageManager(cwd, pkg)
  const frameworks = detectFrameworks(deps)
  const tailwindcssVersion = hasDependency(deps, 'tailwindcss')
    ? readDependencyVersion(cwd, 'tailwindcss')
    : undefined
  const weappTailwindcssVersion = hasDependency(deps, 'weapp-tailwindcss')
    ? readDependencyVersion(cwd, 'weapp-tailwindcss')
    : undefined
  const tailwindMajor = getMajorVersion(tailwindcssVersion) ?? getDependencyMajor(deps, 'tailwindcss')
  const tailwindConfig = findFirstExisting(cwd, CONFIG_FILES.tailwind)
  const postcssConfig = findFirstExisting(cwd, CONFIG_FILES.postcss)
  const viteConfig = findFirstExisting(cwd, CONFIG_FILES.vite)
  const webpackConfig = findFirstExisting(cwd, CONFIG_FILES.webpack)
  const tailwindOwners = findConfiguredTailwindOwners(cwd, [postcssConfig, viteConfig, webpackConfig])
  const cssEntries = [postcssConfig, viteConfig, webpackConfig]
    .map(file => ({ file, source: readConfigText(cwd, file) }))
    .flatMap(({ file, source }) => extractConfiguredCssEntries(source).map(entry => ({ file, entry })))
  const buildConfigs = [postcssConfig, viteConfig, webpackConfig]
    .map(file => ({ file, source: readConfigText(cwd, file) }))
    .filter((item): item is { file: string, source: string } => Boolean(item.file && item.source))

  addCheck(checks, pkg
    ? {
        id: 'package-json',
        title: 'package.json',
        status: 'ok',
        message: '已找到项目 package.json。',
      }
    : {
        id: 'package-json',
        title: 'package.json',
        status: 'error',
        message: '当前目录没有 package.json。',
        suggestion: '请在项目根目录运行 doctor，或通过 --cwd 指向项目根目录。',
      })

  addCheck(checks, semver.satisfies(nodeVersion, WEAPP_TW_REQUIRED_NODE_VERSION_RANGE)
    ? {
        id: 'node-version',
        title: 'Node.js',
        status: 'ok',
        message: `当前 Node.js ${nodeVersion} 满足版本要求 ${WEAPP_TW_REQUIRED_NODE_VERSION_RANGE}。`,
      }
    : {
        id: 'node-version',
        title: 'Node.js',
        status: 'error',
        message: `当前 Node.js ${nodeVersion} 不满足版本要求 ${WEAPP_TW_REQUIRED_NODE_VERSION_RANGE}。`,
        suggestion: '请升级 Node.js 后再安装或构建 weapp-tailwindcss 项目。',
      })

  addCheck(checks, packageManager
    ? {
        id: 'package-manager',
        title: '包管理器',
        status: packageManager.startsWith('pnpm') ? 'ok' : 'info',
        message: `检测到 ${packageManager}。`,
      }
    : {
        id: 'package-manager',
        title: '包管理器',
        status: 'info',
        message: '未检测到 lockfile 或 packageManager 字段。',
      })

  addCheck(checks, hasDependency(deps, 'weapp-tailwindcss') || Boolean(weappTailwindcssVersion)
    ? {
        id: 'weapp-tailwindcss',
        title: 'weapp-tailwindcss',
        status: 'ok',
        message: `检测到 weapp-tailwindcss${weappTailwindcssVersion ? `@${weappTailwindcssVersion}` : ''}。`,
      }
    : {
        id: 'weapp-tailwindcss',
        title: 'weapp-tailwindcss',
        status: 'warn',
        message: '未在当前项目依赖中检测到 weapp-tailwindcss。',
        suggestion: '如果这是业务项目，请安装 weapp-tailwindcss 并确认命令运行在项目根目录。',
      })

  addCheck(checks, hasDependency(deps, 'tailwindcss') || Boolean(tailwindcssVersion)
    ? {
        id: 'tailwindcss',
        title: 'Tailwind CSS',
        status: 'ok',
        message: `检测到 tailwindcss${tailwindcssVersion ? `@${tailwindcssVersion}` : ''}。`,
      }
    : {
        id: 'tailwindcss',
        title: 'Tailwind CSS',
        status: 'error',
        message: '未检测到 tailwindcss。',
        suggestion: '请安装 tailwindcss，并确认依赖可以从当前项目解析。',
      })

  addCheck(checks, tailwindConfig
    ? {
        id: 'tailwind-config',
        title: 'Tailwind 配置',
        status: 'ok',
        message: `检测到 ${tailwindConfig}。`,
      }
    : {
        id: 'tailwind-config',
        title: 'Tailwind 配置',
        status: tailwindMajor === 4 ? 'info' : 'warn',
        message: '未检测到 tailwind.config.*。',
        suggestion: tailwindMajor === 4
          ? 'Tailwind CSS v4 可以采用 CSS-first 配置；复杂 content/source 场景请补充配置文件。'
          : '请确认 Tailwind content/source 配置能够覆盖小程序页面、组件和脚本文件。',
      })

  addCheck(checks, postcssConfig
    ? {
        id: 'postcss-config',
        title: 'PostCSS 配置',
        status: 'ok',
        message: `检测到 ${postcssConfig}。`,
      }
    : {
        id: 'postcss-config',
        title: 'PostCSS 配置',
        status: viteConfig ? 'info' : 'warn',
        message: '未检测到 postcss.config.*。',
        suggestion: '如果通过 PostCSS 接入，请补充 postcss.config.*；如果通过 Vite/Taro 插件接入，可忽略此项。',
      })

  if (tailwindMajor === 4 && tailwindOwners.owners.size > 0) {
    addCheck(checks, {
      id: 'tailwindcss-generator-owner',
      title: 'Tailwind 生成器归属',
      status: 'warn',
      message: `检测到官方 Tailwind ${[...tailwindOwners.owners].join(' 与 ')} 生成器配置。生成模式下不要与 WeappTailwindcss 同时运行两套 Tailwind 生成器。`,
      suggestion: '移除 @tailwindcss/vite 或 @tailwindcss/postcss 的生成配置，仅保留 WeappTailwindcss；PostCSS 中可以继续保留其他业务插件。',
      code: 'duplicate-tailwind-generator',
      evidence: tailwindOwners.evidence,
    })
  }

  if (tailwindMajor === 4 && cssEntries.length > 0) {
    const missingEntries = cssEntries.filter(({ entry }) => !existsSync(path.resolve(cwd, entry)))
    const entriesWithoutTailwindImport = cssEntries.filter(({ entry }) => {
      if (!existsSync(path.resolve(cwd, entry))) {
        return false
      }
      try {
        const source = readFileSync(path.resolve(cwd, entry), 'utf8')
        return !/@import\s+["']tailwindcss["']/u.test(source)
          && !/@import\s+["']tailwindcss\//u.test(source)
      }
      catch {
        return false
      }
    })
    if (missingEntries.length > 0) {
      addCheck(checks, {
        id: 'tailwind-css-entry',
        title: 'Tailwind CSS 入口',
        status: 'error',
        message: `配置了不存在的 cssEntries：${missingEntries.map(item => item.entry).join(', ')}。`,
        suggestion: '请将 cssEntries 改为项目根目录解析出的绝对路径，或确认入口文件已创建。',
        code: 'missing-css-entry',
        evidence: missingEntries.map(item => item.file).filter((file): file is string => Boolean(file)),
      })
    }
    if (entriesWithoutTailwindImport.length > 0) {
      addCheck(checks, {
        id: 'tailwind-css-entry-import',
        title: 'Tailwind CSS 入口内容',
        status: 'warn',
        message: `cssEntries 指向的文件未发现 @import "tailwindcss"：${entriesWithoutTailwindImport.map(item => item.entry).join(', ')}。`,
        suggestion: '请在纯 CSS 入口中加入 @import "tailwindcss"，并确保该文件被应用构建图实际引入。',
        code: 'missing-tailwind-import',
        evidence: entriesWithoutTailwindImport.map(item => path.resolve(cwd, item.entry)),
      })
    }

    const sourceDiagnostics = cssEntries.flatMap(({ entry }) => {
      const cssFile = path.resolve(cwd, entry)
      if (!existsSync(cssFile)) {
        return []
      }
      let source: string
      try {
        source = readFileSync(cssFile, 'utf8')
      }
      catch {
        return []
      }
      const directives = extractCssSources(source)
      const diagnostics: DoctorCheck[] = []
      if (!directives.some(directive => !directive.excluded)) {
        diagnostics.push({
          id: 'tailwind-css-source',
          title: 'Tailwind CSS 来源范围',
          status: 'warn',
          message: `${entry} 未发现 @source，Tailwind 可能无法扫描项目源码。`,
          suggestion: '请在 CSS 入口中加入覆盖实际源码目录的 @source；仅配置 cssEntries 不会替代源码扫描声明。',
          code: 'missing-tailwind-source',
          evidence: [cssFile],
        })
      }
      for (const directive of directives) {
        if (directive.inline || directive.excluded) {
          continue
        }
        const probePath = resolveSourceProbePath(cssFile, directive.value)
        if (!existsSync(probePath)) {
          diagnostics.push({
            id: 'tailwind-css-source-path',
            title: 'Tailwind @source 路径',
            status: 'warn',
            message: `@source ${directive.value} 的路径不存在或无法从入口解析。`,
            suggestion: '请按 CSS 入口所在目录修正 @source 相对路径，或确认源码目录已经创建。',
            code: 'invalid-tailwind-source',
            evidence: [cssFile, probePath],
          })
        }
      }
      return diagnostics
    })
    sourceDiagnostics.forEach(check => addCheck(checks, check))
  }

  for (const { file, source } of buildConfigs) {
    const appType = extractConfiguredOption(source, 'appType')
    if (appType && !SUPPORTED_APP_TYPES.has(appType)) {
      addCheck(checks, {
        id: 'app-type',
        title: 'appType 配置',
        status: 'error',
        message: `${file} 使用了不受支持的 appType：${appType}。`,
        suggestion: '请改为 uni-app、uni-app-x、taro、mpx、weapp-vite 或其他公开支持的 appType。',
        code: 'invalid-app-type',
        evidence: [file],
      })
    }
    const target = extractGeneratorTarget(source)
    if (target && !SUPPORTED_GENERATOR_TARGETS.has(target)) {
      addCheck(checks, {
        id: 'generator-target',
        title: '生成目标',
        status: 'error',
        message: `${file} 使用了不受支持的 generator.target：${target}。`,
        suggestion: '请使用 web、weapp 或 app；普通 Vite Web 项目推荐使用 web。',
        code: 'invalid-generator-target',
        evidence: [file],
      })
    }
    const platform = extractConfiguredOption(source, 'platform')
    if (platform && target && ((platform === 'web' && target !== 'web') || (platform !== 'web' && target === 'web'))) {
      addCheck(checks, {
        id: 'generator-platform',
        title: '生成目标与平台',
        status: 'warn',
        message: `${file} 的 platform=${platform} 与 generator.target=${target} 可能不一致。`,
        suggestion: '请让 platform 与 generator.target 指向同一运行端，或删除不必要的显式覆盖以使用自动推断。',
        code: 'generator-target-platform-conflict',
        evidence: [file],
      })
    }
  }

  addCheck(checks, frameworks.length > 0
    ? {
        id: 'framework',
        title: '框架识别',
        status: 'ok',
        message: `检测到 ${frameworks.join(', ')}。`,
      }
    : {
        id: 'framework',
        title: '框架识别',
        status: 'info',
        message: '未从依赖中识别出 Taro、uni-app、MPX 或 Remax。',
      })

  addCheck(checks, viteConfig || webpackConfig
    ? {
        id: 'bundler-config',
        title: '构建器配置',
        status: 'ok',
        message: `检测到 ${[viteConfig, webpackConfig].filter(Boolean).join(', ')}。`,
      }
    : {
        id: 'bundler-config',
        title: '构建器配置',
        status: 'info',
        message: '未检测到 vite.config.* 或 webpack.config.*。',
      })

  return {
    cwd,
    nodeVersion,
    detected: {
      packageManager,
      frameworks,
      tailwindcssVersion,
      weappTailwindcssVersion,
    },
    summary: summarizeChecks(checks),
    checks,
  }
}

export function hasDoctorFailure(report: DoctorReport, strict = false) {
  return report.summary.error > 0 || (strict && report.summary.warn > 0)
}

export function formatDoctorReport(report: DoctorReport) {
  const lines = [
    `weapp-tailwindcss doctor`,
    `cwd: ${report.cwd}`,
    `summary: ${report.summary.error} error, ${report.summary.warn} warn, ${report.summary.ok} ok, ${report.summary.info} info`,
    '',
  ]

  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.title}: ${check.message}`)
    if (check.suggestion) {
      lines.push(`  -> ${check.suggestion}`)
    }
  }

  return lines.join('\n')
}
