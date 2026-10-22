import type { Declaration, PluginCreator } from 'postcss';
import transform from './lib/transform.ts';

export interface PostCssCalcOptions {
  precision?: number | false;
  preserve?: boolean;
  warnWhenCannotResolve?: boolean;
  mediaQueries?: boolean;
  selectors?: boolean;
  customPropertyValues?: ReadonlyMap<string, string>;
  includeCustomProperties?: (string | RegExp)[];
  filterDeclaration?: (declaration: Declaration) => boolean;
}

interface NormalizedPostCssCalcOptions {
  precision: number;
  preserve: boolean;
  warnWhenCannotResolve: boolean;
  mediaQueries: boolean;
  selectors: boolean;
  customPropertyValues?: ReadonlyMap<string, string>;
  includeCustomProperties?: (string | RegExp)[];
  filterDeclaration?: (declaration: Declaration) => boolean;
}

export type PostCssCalcPluginCreator = PluginCreator<PostCssCalcOptions> & {
  postcss: true;
};

const pluginCreator = ((opts = {}) => {
  const options = Object.assign(
    {
      precision: 5,
      preserve: false,
      warnWhenCannotResolve: false,
      mediaQueries: false,
      selectors: false,
    },
    opts
  ) as NormalizedPostCssCalcOptions;

  return {
    postcssPlugin: 'postcss-calc',
    OnceExit(css, { result }) {
      css.walk((node) => {
        const { type } = node;
        if (type === 'decl' && options.filterDeclaration?.(node) !== false) {
          transform(node, 'value', options, result);
        }

        if (type === 'atrule' && options.mediaQueries) {
          transform(node, 'params', options, result);
        }

        if (type === 'rule' && options.selectors) {
          transform(node, 'selector', options, result);
        }
      });
    },
  };
}) as PostCssCalcPluginCreator;

pluginCreator.postcss = true;

export default pluginCreator;
