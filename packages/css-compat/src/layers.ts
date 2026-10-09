import type { Plugin, Root } from 'postcss'
import type { CascadeLayerDiagnostic } from './diagnostics'
import type { Reporter } from './layers/reporter'
import { collectLayers } from './layers/collect'
import { diagnoseConflicts } from './layers/conflicts'
import { validateInput } from './layers/input'
import { orderedLayers } from './layers/model'
import { createReporter } from './layers/reporter'

export interface CascadeLayerOptions {
  mode: 'ordered' | 'preserve'
  onConflict?: 'warning' | 'error' | undefined
  inputStage?: 'native' | 'polyfilled' | undefined
}

export interface CascadeLayerCompilation {
  root: Root
  diagnostics: CascadeLayerDiagnostic[]
}

/** 只编译当前 Root 的级联作用域；错误时不修改输入 AST。 */
export function compileCascadeLayers(root: Root, options: CascadeLayerOptions): CascadeLayerCompilation {
  const reporter = createReporter(options?.onConflict ?? 'warning')
  return compile(root, options, reporter)
}

function compile(root: Root, options: CascadeLayerOptions, reporter: Reporter): CascadeLayerCompilation {
  if (!options || !['ordered', 'preserve'].includes(options.mode)
    || (options.onConflict !== undefined && !['warning', 'error'].includes(options.onConflict))
    || (options.inputStage !== undefined && !['native', 'polyfilled'].includes(options.inputStage))) {
    reporter.fail(root, 'LAYER_OPTIONS', '必须提供合法的 mode、onConflict 和 inputStage。', '显式选择 ordered 或 preserve，诊断策略使用 warning 或 error。')
  }
  if (options.mode === 'preserve') {
    return { root, diagnostics: [] }
  }
  if (options.inputStage === 'polyfilled') {
    reporter.fail(root, 'LAYER_INPUT_STAGE', '输入已丢失原生层信息。', '关闭上游 polyfill 并重新生成 CSS，或使用显式 legacy 入口。')
  }
  const input = validateInput(root, reporter)
  if (!input.hasLayers) {
    return { root, diagnostics: reporter.diagnostics }
  }
  const { rootLayer, prologue } = collectLayers(root, input.selectors, reporter)
  const layers = orderedLayers(rootLayer)
  diagnoseConflicts(layers, reporter)
  const output = [...prologue, ...layers.flatMap(layer => layer.normal), ...[...layers].reverse().flatMap(layer => layer.important)]
  root.removeAll()
  root.append(output)
  return { root, diagnostics: reporter.diagnostics }
}

/** 在其他插件完成 import/nesting 后编译，并将定位诊断交给 PostCSS。 */
export function createCascadeLayersPlugin(options: CascadeLayerOptions): Plugin {
  return {
    postcssPlugin: 'weapp-css-compat-layers',
    OnceExit(root, { result }) {
      const reporter = createReporter(options?.onConflict ?? 'warning')
      const compilation = compile(root, options, reporter)
      for (const diagnostic of compilation.diagnostics) {
        const warning = result.warn(`[${diagnostic.code}] ${diagnostic.message}`, {
          plugin: 'weapp-css-compat-layers',
          node: reporter.nodes.get(diagnostic)!,
        })
        Object.assign(warning, { code: diagnostic.code, diagnostic })
      }
    },
  }
}
