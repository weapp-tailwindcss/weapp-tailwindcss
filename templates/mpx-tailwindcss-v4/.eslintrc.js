const { createRequire } = require('node:module')

// 从配置所属依赖图定位 parser，避免 .mpx 内层解析借用其他工具链版本。
const configRequire = createRequire(require.resolve('@mpxjs/eslint-config-ts'))
const typescriptParser = configRequire.resolve('@typescript-eslint/parser')

const legacyBannedTypes = {
  String: {
    message: 'Use string instead',
    fixWith: 'string',
  },
  Boolean: {
    message: 'Use boolean instead',
    fixWith: 'boolean',
  },
  Number: {
    message: 'Use number instead',
    fixWith: 'number',
  },
  Symbol: {
    message: 'Use symbol instead',
    fixWith: 'symbol',
  },
  BigInt: {
    message: 'Use bigint instead',
    fixWith: 'bigint',
  },
  Function: {
    message: [
      'The `Function` type accepts any function-like value.',
      'It provides no type safety when calling the function, which can be a common source of bugs.',
      'It also accepts things like class declarations, which will throw at runtime as they will not be called with `new`.',
      'If you are expecting the function to accept certain arguments, you should explicitly define the function shape.',
    ].join('\n'),
  },
  // 保留 v5 的对象类型限制。
  Object: {
    message: [
      'The `Object` type actually means "any non-nullish value", so it is marginally better than `unknown`.',
      '- If you want a type meaning "any object", you probably want `object` instead.',
      '- If you want a type meaning "any value", you probably want `unknown` instead.',
      '- If you really want a type meaning "any non-nullish value", you probably want `NonNullable<unknown>` instead.',
    ].join('\n'),
    suggest: ['object', 'unknown', 'NonNullable<unknown>'],
  },
  '{}': {
    message: [
      '`{}` actually means "any non-nullish value".',
      '- If you want a type meaning "any object", you probably want `object` instead.',
      '- If you want a type meaning "any value", you probably want `unknown` instead.',
      '- If you want a type meaning "empty object", you probably want `Record<string, never>` instead.',
      '- If you really want a type meaning "any non-nullish value", you probably want `NonNullable<unknown>` instead.',
    ].join('\n'),
    suggest: [
      'object',
      'unknown',
      'Record<string, never>',
      'NonNullable<unknown>',
    ],
  },
}

module.exports = {
  root: true,
  extends: ['@mpxjs/eslint-config-ts'],
  parserOptions: {
    parser: typescriptParser
  },
  rules: {
    // .mpx文件规则 https://mpx-ecology.github.io/eslint-plugin-mpx/rules/
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: typescriptParser,
      plugins: ['@stylistic/ts'],
      rules: {
        // 还原 v5 eslint-recommended 的核心规则覆盖。
        'no-class-assign': 'error',
        'no-with': 'error',
        'valid-typeof': 'off',

        // 禁用 v8 新增的推荐检查，保留原模板范围。
        '@typescript-eslint/no-duplicate-enum-values': 'off',
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-unsafe-declaration-merging': 'off',
        '@typescript-eslint/no-unsafe-function-type': 'off',
        '@typescript-eslint/no-wrapper-object-types': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',
        'no-unused-expressions': ['error', {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true
        }],

        // 还原从 v8 recommended 移除的 v5 检查。
        '@typescript-eslint/adjacent-overload-signatures': 'error',
        '@typescript-eslint/no-restricted-types': ['error', { types: legacyBannedTypes }],
        'no-empty-function': 'off',
        '@typescript-eslint/no-empty-function': ['error', { allow: [] }],
        '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: false }],
        '@typescript-eslint/no-inferrable-types': ['error', {
          ignoreParameters: false,
          ignoreProperties: false
        }],
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/no-var-requires': ['error', { allow: [] }],
        'no-loss-of-precision': 'error',
        'no-extra-semi': 'off',
        '@stylistic/ts/no-extra-semi': 'error',

        // 锁定原级别与默认项，避免推荐配置与默认项升级造成漂移。
        '@typescript-eslint/no-explicit-any': ['warn', {
          fixToUnknown: false,
          ignoreRestArgs: false
        }],
        '@typescript-eslint/no-unused-vars': ['warn', {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          caughtErrors: 'none'
        }],
        '@typescript-eslint/ban-ts-comment': ['error', {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 3
        }],
        '@typescript-eslint/no-namespace': ['error', {
          allowDeclarations: false,
          allowDefinitionFiles: true
        }],
        '@typescript-eslint/no-this-alias': ['error', {
          allowDestructuring: true,
          allowedNames: []
        }],
        '@typescript-eslint/triple-slash-reference': ['error', {
          lib: 'always',
          path: 'never',
          types: 'prefer-import'
        }]
      }
    },
    {
      files: ['**/*.js'],
      rules: {
        // .js文件规则 https://eslint.bootcss.com/docs/rules/
      }
    }
  ]
}
