import path from 'node:path'
import { bundlerFrameworkNames, frameworkCatalog } from '../../../packages/weapp-tailwindcss/src/framework/catalog'

export interface FrameworkRegistration {
  readonly aliases: readonly string[]
  readonly family?: string | undefined
}

export interface ModuleOwnership {
  readonly package: 'weapp-tailwindcss' | 'weapp-style-injector'
  readonly path: readonly string[]
  readonly descendants?: boolean
  readonly owner: string | undefined
}

export interface FrameworkBoundaryRegistration {
  readonly frameworks: Readonly<Record<string, FrameworkRegistration>>
  readonly bundlers: Readonly<Record<string, readonly string[]>>
  readonly modules: readonly ModuleOwnership[]
}

/** 通用实现与兼容遗留路径也显式登记，新增目录不能默认为共享代码。 */
const sharedModules: ModuleOwnership[] = [
  ...['environment', 'environment-snapshot', 'resolve', 'types'].map(name => ({ package: 'weapp-tailwindcss' as const, path: ['framework-policies', `${name}.ts`], owner: undefined })),
  ...['index', 'shared'].map(name => ({ package: 'weapp-tailwindcss' as const, path: ['presets', `${name}.ts`], owner: undefined })),
  ...['options', 'internal', 'vite-web', 'types'].map(name => ({ package: 'weapp-tailwindcss' as const, path: ['style-injector', `${name}.ts`], owner: undefined })),
  ...['vite', 'webpack'].flatMap(bundler => ['generic', 'runtime', 'options', 'plugins'].map(name => ({ package: 'weapp-tailwindcss' as const, path: ['style-injector', bundler, `${name}.ts`], owner: undefined }))),
  { package: 'weapp-tailwindcss', path: ['style-injector', 'vite', 'descriptor.ts'], owner: undefined },
  ...['index', 'core', 'preset-resolution', 'subpackage', 'subpackage-resolution', 'types', 'utils', 'vite', 'webpack'].map(name => ({ package: 'weapp-style-injector' as const, path: [`${name}.ts`], owner: undefined })),
]

const legacyModules: ModuleOwnership[] = [
  { package: 'weapp-tailwindcss', path: ['uni-app-x'], descendants: true, owner: 'uni-app-x' },
  { package: 'weapp-tailwindcss', path: ['shared', 'mpx.ts'], owner: 'mpx' },
  { package: 'weapp-tailwindcss', path: ['shared', 'mpx-plugin-owner.ts'], owner: 'mpx' },
  { package: 'weapp-tailwindcss', path: ['bundlers', 'vite', 'uni-app-x-css-options.ts'], owner: 'uni-app-x' },
  { package: 'weapp-tailwindcss', path: ['bundlers', 'vite', 'generate-bundle', 'uni-app-x-postprocess.ts'], owner: 'uni-app-x' },
  { package: 'weapp-tailwindcss', path: ['presets', 'hbuilderx.ts'], owner: 'uni' },
  { package: 'weapp-tailwindcss', path: ['style-injector', 'vite', 'uni.ts'], owner: 'uni' },
  { package: 'weapp-tailwindcss', path: ['style-injector', 'vite', 'uni-app.ts'], owner: 'uni' },
  { package: 'weapp-tailwindcss', path: ['style-injector', 'webpack', 'uni-app.ts'], owner: 'uni' },
  ...['mpx', 'taro', 'uni-app'].flatMap(name => [
    { package: 'weapp-style-injector' as const, path: [`${name}.ts`], owner: name === 'uni-app' ? 'uni' : name },
    { package: 'weapp-style-injector' as const, path: [name], descendants: true, owner: name === 'uni-app' ? 'uni' : name },
    ...['vite', 'webpack'].flatMap(bundler => [
      { package: 'weapp-style-injector' as const, path: [bundler, `${name}.ts`], owner: name === 'uni-app' ? 'uni' : name },
      { package: 'weapp-style-injector' as const, path: [bundler, name], descendants: true, owner: name === 'uni-app' ? 'uni' : name },
    ]),
  ]),
]

export function createFrameworkBoundaryRegistration(
  frameworks: FrameworkBoundaryRegistration['frameworks'] = frameworkCatalog,
  bundlers: FrameworkBoundaryRegistration['bundlers'] = bundlerFrameworkNames,
  modules: readonly ModuleOwnership[] = [],
): FrameworkBoundaryRegistration {
  const generated: ModuleOwnership[] = []
  for (const name of Object.keys(frameworks)) {
    for (const directory of ['framework-policies', 'presets']) {
      const owner = name === 'generic' && directory === 'framework-policies' ? undefined : name
      generated.push({ package: 'weapp-tailwindcss', path: [directory, `${name}.ts`], owner })
      generated.push({ package: 'weapp-tailwindcss', path: [directory, name], descendants: true, owner })
    }
  }
  for (const [bundler, names] of Object.entries(bundlers)) {
    generated.push({ package: 'weapp-tailwindcss', path: ['bundlers', bundler, 'frameworks', 'index.ts'], owner: undefined })
    for (const name of names) {
      generated.push({ package: 'weapp-tailwindcss', path: ['bundlers', bundler, 'frameworks', name], descendants: true, owner: name })
      if (!['generic', 'uni-app'].includes(name)) {
        generated.push({ package: 'weapp-tailwindcss', path: ['style-injector', bundler, `${name}.ts`], owner: name })
      }
    }
    for (const family of new Set(Object.values(frameworks).map(entry => entry.family).filter((name): name is string => name !== undefined))) {
      generated.push({ package: 'weapp-tailwindcss', path: ['bundlers', bundler, 'frameworks', 'shared', family], descendants: true, owner: family })
    }
  }
  return { frameworks, bundlers, modules: [...sharedModules, ...legacyModules, ...generated, ...modules] }
}

export const defaultFrameworkBoundaryRegistration = createFrameworkBoundaryRegistration()

export function auditFrameworkRegistration(registration: FrameworkBoundaryRegistration): string[] {
  const errors: string[] = []
  const names = new Set(Object.keys(registration.frameworks))
  const families = new Set(Object.values(registration.frameworks).map(entry => entry.family).filter((name): name is string => name !== undefined))
  const aliases = new Map<string, string>()
  for (const [name, entry] of Object.entries(registration.frameworks)) {
    for (const alias of [name, ...entry.aliases]) {
      const owner = aliases.get(alias)
      if (owner !== undefined && owner !== name) {
        errors.push(`框架别名归属冲突：${alias} -> ${owner}, ${name}`)
      }
      aliases.set(alias, name)
    }
  }
  for (const [bundler, supported] of Object.entries(registration.bundlers)) {
    for (const name of supported) {
      if (!names.has(name)) {
        errors.push(`构建器支持组合缺少框架登记：${bundler} -> ${name}`)
      }
    }
  }
  for (const module of registration.modules) {
    if (module.owner !== undefined && !names.has(module.owner) && !families.has(module.owner)) {
      errors.push(`模块所有者缺少框架登记：${path.join(module.package, ...module.path)} -> ${module.owner}`)
    }
  }
  return errors
}

/** 匹配操作只使用文件系统 path API，兼容盘符、UNC 与相对工作树。 */
export function resolveFrameworkOwnership(source: string, file: string, paths: typeof path = path, registration = defaultFrameworkBoundaryRegistration) {
  const packageRoots = {
    'weapp-tailwindcss': source,
    'weapp-style-injector': paths.resolve(source, '..', '..', 'weapp-style-injector', 'src'),
  }
  const matches = registration.modules.filter((rule) => {
    const target = paths.join(packageRoots[rule.package], ...rule.path)
    const relative = paths.relative(target, file)
    return relative === '' || (rule.descendants === true && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative))
  })
  const owners = new Set(matches.map(match => match.owner))
  const mainParts = paths.relative(source, file).split(paths.sep)
  const injectorRelative = paths.relative(packageRoots['weapp-style-injector'], file)
  const inInjector = injectorRelative !== '..' && !injectorRelative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(injectorRelative)
  const required = inInjector || ['framework-policies', 'presets'].includes(mainParts[0]!)
    || (mainParts[0] === 'bundlers' && mainParts[2] === 'frameworks')
    || mainParts[0] === 'style-injector'
  return { owner: owners.size === 1 ? [...owners][0] : undefined, missing: required && matches.length === 0, conflicting: owners.size > 1 }
}
