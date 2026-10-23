import type { FrameworkBoundaryRegistration } from './ownership'
import path from 'node:path'

export interface FrameworkBoundaryEdge {
  readonly from: string
  readonly to: string
  readonly kind: 'assembly' | 'compatibility'
  readonly entryOnly?: boolean
  readonly reason: string
  readonly replacement: string
}

/** 只授权列出的直接依赖，不给入口文件或目录整体放行。 */
export function createFrameworkBoundaryEdges(root: string, registration: FrameworkBoundaryRegistration): FrameworkBoundaryEdge[] {
  const main = (...parts: string[]) => path.join(root, 'packages', 'weapp-tailwindcss', 'src', ...parts)
  const injector = (...parts: string[]) => path.join(root, 'packages', 'weapp-style-injector', 'src', ...parts)
  const edges: FrameworkBoundaryEdge[] = []
  const assemble = (from: string, to: string, reason = '公开入口或框架注册表选择已登记的实现') => edges.push({ from, to, kind: 'assembly', reason, replacement: '内部消费者使用中立契约或所选框架的局部入口' })
  const compatible = (from: string, to: string, reason: string, replacement: string) => edges.push({ from, to, kind: 'compatibility', reason, replacement })

  for (const [from, to] of [
    [['core', 'compiler', 'index.ts'], ['context', 'compiler.ts']],
    [['core', 'compiler', 'index.ts'], ['context', 'compiler-options.ts']],
    [['compiler', 'mode.ts'], ['context', 'compiler-mode.ts']],
  ]) {
    edges.push({ from: main(...from!), to: main(...to!), kind: 'compatibility', entryOnly: true, reason: '旧公开 compiler 入口保留兼容创建与模式解析', replacement: '内部消费 compiler 类型、createResolvedCompiler 或已解析模式，禁止经过公开 facade' })
  }

  for (const parts of [
    ['context', 'index.ts'],
    ['generator', 'options.ts'],
    ['runtime-branch', 'index.ts'],
    ['runtime-branch', 'generator-target-env.ts'],
    ['runtime-branch', 'platform.ts'],
  ]) {
    compatible(main(...parts), main('framework-policies', 'resolve.ts'), '旧公开归一化调用保持参数与返回形状', '内部编译只消费 ResolvedCompilationProfile')
  }
  compatible(main('bundlers', 'framework-selector.ts'), main('uni-app-x', 'options.ts'), '公开 uniAppX 配置参与既有框架选择优先级', '构建器内部消费所选框架能力')

  for (const name of Object.keys(registration.frameworks)) {
    assemble(main('framework-policies', 'resolve.ts'), main('framework-policies', `${name}.ts`))
  }
  for (const [bundler, names] of Object.entries(registration.bundlers)) {
    const entry = bundler === 'webpack' ? main('bundlers', bundler, 'frameworks', 'index.ts') : main('bundlers', bundler, 'index.ts')
    for (const name of names) {
      assemble(entry, main('bundlers', bundler, 'frameworks', name, 'index.ts'))
    }
  }
  assemble(main('bundlers', 'vite', 'index.ts'), main('bundlers', 'vite', 'frameworks', 'generic', 'web.ts'))
  assemble(main('vite-web.ts'), main('bundlers', 'vite', 'frameworks', 'generic', 'web.ts'))
  assemble(main('bundlers', 'webpack', 'BaseUnifiedPlugin', 'v5.ts'), main('bundlers', 'webpack', 'frameworks', 'index.ts'))
  assemble(main('bundlers', 'webpack', 'index.ts'), main('bundlers', 'webpack', 'BaseUnifiedPlugin', 'v5.ts'))
  assemble(main('bundlers', 'rspack', 'index.ts'), main('bundlers', 'webpack', 'index.ts'))
  for (const bundler of ['vite', 'webpack', 'rspack', 'gulp']) {
    assemble(main(`${bundler}.ts`), main('bundlers', bundler, 'index.ts'))
  }
  assemble(main('webpack.ts'), main('bundlers', 'webpack', 'BaseUnifiedPlugin', 'v5.ts'))
  for (const entry of ['vite', 'webpack', 'gulp', 'presets']) {
    assemble(main('index.ts'), main(`${entry}.ts`))
  }
  assemble(main('typedoc.export.ts'), main('index.ts'), '文档声明入口保留公开类型导出')
  assemble(main('presets.ts'), main('presets', 'index.ts'))
  for (const name of ['hbuilderx', ...Object.keys(registration.frameworks)]) {
    assemble(main('presets', 'index.ts'), main('presets', `${name}.ts`))
  }
  for (const [bundler, names] of Object.entries(registration.bundlers)) {
    for (const name of names) {
      assemble(main('style-injector', 'internal.ts'), main('style-injector', bundler, `${name}.ts`))
    }
  }
  assemble(main('style-injector', 'internal.ts'), main('style-injector', 'vite', 'uni.ts'))

  for (const name of ['mpx', 'taro', 'uni-app']) {
    assemble(injector('index.ts'), injector(`${name}.ts`), '保留 style injector 根入口的公开导出')
    compatible(injector('types.ts'), injector(`${name}.ts`), '公开类型聚合保留既有框架配置类型', '内部类型从其领域所有者或中立 types 子路径消费')
    for (const bundler of ['vite', 'webpack']) {
      assemble(injector('index.ts'), injector(bundler, `${name}.ts`), '保留 style injector 根入口的公开导出')
    }
  }
  for (const bundler of ['vite', 'webpack']) {
    compatible(injector(`${bundler}.ts`), injector('uni-app.ts'), '公开通用 injector 保留 uniAppSubPackages/uniAppStyleScopes 参数转换与类型', '框架组装传入中立 subpackageStyleScopes')
  }
  return edges
}

export function formatFrameworkBoundaryEdges(root: string, edges: readonly FrameworkBoundaryEdge[]) {
  return edges.map(edge => ({
    from: path.relative(root, edge.from),
    to: path.relative(root, edge.to),
    kind: edge.kind,
    entryOnly: edge.entryOnly ?? false,
    reason: edge.reason,
    replacement: edge.replacement,
  }))
}
