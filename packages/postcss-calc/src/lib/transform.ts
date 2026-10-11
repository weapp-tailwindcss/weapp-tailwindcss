import type { ChildNode, Container, Result } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';

import parserModule from '../parser.cjs';
import type { CalcNode } from '../parser';
import reducer from './reducer.ts';
import stringifier from './stringifier.ts';
import { isCustomPropertyName } from './custom-properties.ts';

const { parser } = parserModule;

export type TransformProperty = 'value' | 'params' | 'selector';

const MATCH_CALC = /((?:-(moz|webkit)-)?calc(?!-))/i;

interface TransformOptions {
  precision: number;
  preserve: boolean;
  warnWhenCannotResolve: boolean;
  customPropertyValues?: ReadonlyMap<string, string>;
  includeCustomProperties?: (string | RegExp)[];
}

function shouldResolveProperty(name: string, options: TransformOptions) {
  return options.includeCustomProperties?.some((entry) => {
    if (typeof entry === 'string') return entry === name
    entry.lastIndex = 0
    return entry.test(name)
  }) ?? false
}

function resolveCustomProperties(value: string, options: TransformOptions, stack = new Set<string>()): string {
  const customPropertyValues = options.customPropertyValues
  // 只有确实包含 var() 时才构造 value AST，避免普通 calc 声明承担额外开销。
  if (
    !customPropertyValues ||
    !options.includeCustomProperties?.length ||
    !value.includes('var(')
  ) return value
  const parsed = valueParser(value)
  parsed.walk((node, index, nodes) => {
    if (node.type !== 'function' || node.value !== 'var') return
    const comma = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
    const name = valueParser.stringify(comma >= 0 ? node.nodes.slice(0, comma) : node.nodes).trim()
    if (!isCustomPropertyName(name) || !shouldResolveProperty(name, options) || stack.has(name)) return
    const resolved = customPropertyValues.get(name)
    const fallback = comma >= 0 ? valueParser.stringify(node.nodes.slice(comma + 1)).trim() : undefined
    const replacement = resolved !== undefined
      ? resolveCustomProperties(resolved, options, new Set([...stack, name]))
      : fallback
    if (replacement === undefined) return
    nodes[index] = {
      type: 'word',
      value: replacement,
      sourceIndex: node.sourceIndex,
      sourceEndIndex: node.sourceEndIndex,
    }
    return false
  })
  return parsed.toString()
}

type TransformNode = ChildNode & {
  value?: string;
  params?: string;
  selector?: string;
  parent?: Container;
  clone: () => TransformNode;
};

function transformValue(
  value: string,
  options: TransformOptions,
  result: Result,
  item: ChildNode
): string {
  return valueParser(value)
    .walk((node) => {
      // skip anything which isn't a calc() function
      if (node.type !== 'function' || !MATCH_CALC.test(node.value)) {
        return;
      }

      // stringify calc expression and produce an AST
      const contents = resolveCustomProperties(valueParser.stringify(node.nodes), options);
      const ast = parser.parse(contents);

      // reduce AST to its simplest form, that is, either to a single value
      // or a simplified calc expression
      const reducedAst = reducer(ast, options.precision);

      const wordNode = node as unknown as valueParser.WordNode;
      wordNode.type = 'word';
      node.value = stringifier(
        node.value,
        reducedAst,
        value,
        options,
        result,
        item
      );

      return false;
    })
    .toString();
}

function transformSelector(
  value: string,
  options: TransformOptions,
  result: Result,
  item: ChildNode
): string {
  return selectorParser((selectors) => {
    selectors.walk((node) => {
      // attribute value
      // e.g. the "calc(3*3)" part of "div[data-size="calc(3*3)"]"
      if (node.type === 'attribute' && node.value) {
        node.setValue(transformValue(node.value, options, result, item));
      }

      // tag value
      // e.g. the "calc(3*3)" part of "div:nth-child(2n + calc(3*3))"
      if (node.type === 'tag') {
        node.value = transformValue(node.value, options, result, item);
      }

      return;
    });
  }).processSync(value);
}

export default function transform(
  node: TransformNode,
  property: TransformProperty,
  options: TransformOptions,
  result: Result
): void {
  const originalValue = node[property];
  if (typeof originalValue !== 'string') {
    return;
  }

  let value = originalValue;

  try {
    value =
      property === 'selector'
        ? transformSelector(originalValue, options, result, node)
        : transformValue(originalValue, options, result, node);
  } catch (error) {
    if (error instanceof Error) {
      result.warn(error.message, { node });
    } else {
      result.warn('Error', { node });
    }
    return;
  }

  // if the preserve option is enabled and the value has changed, write the
  // transformed value into a cloned node which is inserted before the current
  // node, preserving the original value. Otherwise, overwrite the original
  // value.
  if (options.preserve && originalValue !== value) {
    if (!node.parent) {
      return;
    }
    const clone = node.clone();
    clone[property] = value;
    node.parent.insertBefore(node, clone);
  } else {
    node[property] = value;
  }
}
