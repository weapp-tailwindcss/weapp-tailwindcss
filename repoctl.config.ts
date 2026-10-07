import { defineMonorepoConfig } from 'repoctl'

export default defineMonorepoConfig({
  commands: {
    ai: {
      baseDir: 'agentic/prompts',
      format: 'md',
      force: false,
    },
    create: {
      defaultTemplate: 'tsdown',
      renameJson: false,
    },
    clean: {
      autoConfirm: false,
      includePrivate: true,
    },
    release: {
      hooks: {
        beforeVersion: ['native:artifacts:before-version'],
        verify: ['release:verify'],
        afterVersion: ['native:artifacts:after-version'],
        beforePublish: ['native:artifacts:verify'],
        afterPublish: [
          {
            script: 'release:sync-npmmirror',
            continueOnError: true,
          },
        ],
      },
    },
    upgrade: {
      skipOverwrite: false,
      mergeTargets: true,
      targets: [
        '.github/workflows/ci.yml',
        '.github/workflows/release.yml',
        '.github/workflows/sync-gitee.yml',
        '.gitignore',
        '.npmrc',
        '.vscode/extensions.json',
        '.vscode/settings.json',
        'AGENTS.md',
        'commitlint.config.ts',
        'eslint.config.mjs',
        'lint-staged.config.ts',
        'pnpm-workspace.yaml',
        'prettier.config.mjs',
        'repoctl.config.ts',
        'stylelint.config.mjs',
        'tsconfig.json',
        'turbo.json',
        'vitest.config.ts',
      ],
    },
  },
})
