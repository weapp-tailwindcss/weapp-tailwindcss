import type { ParseResult } from '@babel/parser'
import type { NodePath, TraverseOptions, Visitor } from '@babel/traverse'
import type { CallExpression, ExportDeclaration, File, ImportDeclaration, Node, StringLiteral, TemplateElement } from '@babel/types'
import type { IJsHandlerOptions } from '../../types'
import type { EvalHandler } from '../evalTransforms'
import type { SourceAnalysis } from '../sourceAnalysis'
import { traverse } from '@/babel'
import { createNameMatcher } from '@/utils/nameMatcher'
import { isEvalPath, walkEvalExpression } from '../evalTransforms'
import { JsTokenUpdater } from '../JsTokenUpdater'
import { NodePathWalker } from '../NodePathWalker'
import { createTaggedTemplateIgnore } from '../taggedTemplateIgnore'

const EMPTY_IGNORED_PATHS = new WeakSet<NodePath<StringLiteral | TemplateElement>>()
const EMPTY_IMPORT_DECLARATIONS = new Set<NodePath<ImportDeclaration>>()
const EMPTY_EXPORT_DECLARATIONS = new Set<NodePath<ExportDeclaration>>()
const EMPTY_REQUIRE_CALL_PATHS: NodePath<StringLiteral>[] = []
const ignoredTaggedTemplateMatcherCache = new WeakMap<IJsHandlerOptions, ReturnType<typeof createNameMatcher>>()

function getIgnoredTaggedTemplateMatcher(options: IJsHandlerOptions) {
  const cached = ignoredTaggedTemplateMatcherCache.get(options)
  if (cached) {
    return cached
  }

  const created = createNameMatcher(options.ignoreTaggedTemplateExpressionIdentifiers, { exact: true })
  ignoredTaggedTemplateMatcherCache.set(options, created)
  return created
}

export function analyzeSource(
  ast: ParseResult<File>,
  options: IJsHandlerOptions,
  handler: EvalHandler,
  collectModuleMetadata = true,
): SourceAnalysis {
  const jsTokenUpdater = new JsTokenUpdater()
  // 仅在需要忽略特定调用参数时记录路径，默认路径复用共享空集合。
  const needScope = Boolean(options.ignoreCallExpressionIdentifiers && options.ignoreCallExpressionIdentifiers.length > 0)
  const ignoredPaths = needScope
    ? new WeakSet<NodePath<StringLiteral | TemplateElement>>()
    : EMPTY_IGNORED_PATHS
  const walker = needScope
    ? new NodePathWalker({
        ...(options.ignoreCallExpressionIdentifiers === undefined
          ? {}
          : { ignoreCallExpressionIdentifiers: options.ignoreCallExpressionIdentifiers }),
        callback(path) {
          ignoredPaths.add(path)
        },
      })
    : new NodePathWalker()

  let taggedTemplateIgnore: ReturnType<typeof createTaggedTemplateIgnore> | undefined
  const hasTaggedTemplateIgnoreIdentifiers = Boolean(
    options.ignoreTaggedTemplateExpressionIdentifiers
    && options.ignoreTaggedTemplateExpressionIdentifiers.length > 0,
  )

  function getTaggedTemplateIgnore() {
    if (!taggedTemplateIgnore) {
      taggedTemplateIgnore = createTaggedTemplateIgnore({
        matcher: getIgnoredTaggedTemplateMatcher(options),
        ...(options.ignoreTaggedTemplateExpressionIdentifiers === undefined
          ? {}
          : { names: options.ignoreTaggedTemplateExpressionIdentifiers }),
      })
    }
    return taggedTemplateIgnore
  }

  const targetPaths: NodePath<StringLiteral | TemplateElement>[] = []
  const importDeclarations = collectModuleMetadata
    ? new Set<NodePath<ImportDeclaration>>()
    : EMPTY_IMPORT_DECLARATIONS
  const exportDeclarations = collectModuleMetadata
    ? new Set<NodePath<ExportDeclaration>>()
    : EMPTY_EXPORT_DECLARATIONS
  const requireCallPaths: NodePath<StringLiteral>[] = collectModuleMetadata
    ? []
    : EMPTY_REQUIRE_CALL_PATHS
  const evalHandler = handler

  const templateElementEnter = hasTaggedTemplateIgnoreIdentifiers
    ? (p: NodePath<TemplateElement>) => {
        const pp = p.parentPath
        if (pp.isTemplateLiteral()) {
          const ppp = pp.parentPath
          if (isEvalPath(ppp)) {
            return
          }
          if (ppp.isTaggedTemplateExpression()) {
            const tagPath = ppp.get('tag') as NodePath<Node>
            if (getTaggedTemplateIgnore().shouldIgnore(tagPath)) {
              return
            }
          }
        }
        targetPaths.push(p)
      }
    : (p: NodePath<TemplateElement>) => {
        const pp = p.parentPath
        if (pp.isTemplateLiteral()) {
          const ppp = pp.parentPath
          if (isEvalPath(ppp)) {
            return
          }
        }
        targetPaths.push(p)
      }

  const callExpressionEnter = (!collectModuleMetadata && !needScope)
    ? (p: NodePath<CallExpression>) => {
        if (isEvalPath(p)) {
          walkEvalExpression(p, options, jsTokenUpdater, evalHandler)
        }
      }
    : (p: NodePath<CallExpression>) => {
        if (isEvalPath(p)) {
          walkEvalExpression(p, options, jsTokenUpdater, evalHandler)
          return
        }

        const calleePath = p.get('callee')
        if (
          collectModuleMetadata
          && calleePath.isIdentifier({ name: 'require' })
          // 若 scope 不存在或无法判断绑定，默认认为未被局部绑定，以便在 noScope 下也能收集 require 字面量。
          && !((p as any)?.scope?.hasBinding?.('require'))
        ) {
          const args = p.get('arguments')
          if (Array.isArray(args) && args.length > 0) {
            const first = args[0]
            if (first?.isStringLiteral()) {
              requireCallPaths.push(first)
            }
          }
        }

        // 遍历调用表达式的实参需要作用域信息；快路径下跳过。
        if (needScope) {
          walker.walkCallExpression(p)
        }
      }

  const traverseOptions: TraverseOptions & Visitor<Node> = {
    StringLiteral: {
      enter(p) {
        if (isEvalPath(p.parentPath)) {
          return
        }
        targetPaths.push(p)
      },
    },
    TemplateElement: {
      enter: templateElementEnter,
    },
    CallExpression: {
      enter: callExpressionEnter,
    },
    ...(collectModuleMetadata
      ? {
          ImportDeclaration: {
            enter(p: NodePath<ImportDeclaration>) {
              importDeclarations.add(p)
            },
          },
          ExportDeclaration: {
            enter(p: NodePath<ExportDeclaration>) {
              exportDeclarations.add(p)
            },
          },
        }
      : {}),
  }

  // 使用 `noScope` 避免在常见路径上构建昂贵的作用域数据。
  // 真正需要作用域（遍历调用实参）时，再在局部进行，保持整体遍历轻量。
  traverse(ast, { ...traverseOptions, noScope: !needScope } as any)

  return {
    walker,
    jsTokenUpdater,
    ast,
    targetPaths,
    importDeclarations,
    exportDeclarations,
    requireCallPaths,
    ignoredPaths,
  }
}
