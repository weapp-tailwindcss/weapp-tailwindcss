import type { AppType, UserDefinedOptions } from '@/types'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTailwindSourceForGenerator } from '@/generation/index'
import { getCompilerContext } from '@/context'
import { collectRuntimeClassSet, createTailwindRuntimeReadyPromise } from '@/tailwindcss/runtime'

interface SourceMutationCase {
  title: string
  projectRoot: string
  appType: AppType
  createIsolatedProjectRoot?: () => Promise<string>
  resolveOptions?: (projectRoot: string) => Partial<UserDefinedOptions>
  template: {
    entry: string
    closingTag: string
    makeSnippet: (classLiteral: string, marker: string) => string
  }
  script: {
    entry: string
    applyClassLiteral: (source: string, classLiteral: string) => string
  }
}

function insertBeforeClosingTag(source: string, closingTag: string, snippet: string) {
  const index = source.lastIndexOf(closingTag)
  if (index === -1) {
    throw new Error(`closing tag "${closingTag}" not found`)
  }
  const head = source.slice(0, index)
  const tail = source.slice(index)
  const needsNewline = head.length > 0 && !head.endsWith('\n')
  return `${head}${needsNewline ? '\n' : ''}${snippet}${tail}`
}

function replaceExact(source: string, anchor: string, replacement: string, label: string) {
  if (!source.includes(anchor)) {
    throw new Error(`${label} not found: ${anchor}`)
  }
  return source.replace(anchor, replacement)
}

function createClassLiteral(seed: string) {
  return `text-[#${seed}] bg-[#${seed.split('').reverse().join('')}]`
}

function getClassTokens(classLiteral: string) {
  return classLiteral.split(/\s+/).filter(Boolean)
}

function assertHasAllTokens(classSet: Set<string>, classLiteral: string, label: string) {
  for (const token of getClassTokens(classLiteral)) {
    expect(classSet.has(token), `${label} should contain ${token}`).toBe(true)
  }
}

function assertMissingAllTokens(classSet: Set<string>, classLiteral: string, label: string) {
  for (const token of getClassTokens(classLiteral)) {
    expect(classSet.has(token), `${label} should not contain ${token}`).toBe(false)
  }
}

async function refreshRuntimeClassSet(options: UserDefinedOptions) {
  const ctx = getCompilerContext(options)
  await ctx.refreshTailwindcssRuntime({ clearCache: true })
  await createTailwindRuntimeReadyPromise(ctx.tailwindRuntime)
  const classSet = await collectRuntimeClassSet(ctx.tailwindRuntime, {
    force: true,
    skipRefresh: true,
  })
  return { ctx, classSet }
}

async function runMutationLifecycle(
  testCase: SourceMutationCase,
  mutationKind: 'template' | 'script',
) {
  const mutationConfig = testCase[mutationKind]
  const entryPath = path.resolve(testCase.projectRoot, mutationConfig.entry)
  const original = await fs.readFile(entryPath, 'utf8')
  const addClassLiteral = createClassLiteral('aa11bb')
  const modifyClassLiteral = createClassLiteral('cc22dd')
  const addMarker = `${testCase.title}-${mutationKind}-add`
  const modifyMarker = `${testCase.title}-${mutationKind}-modify`
  const options: UserDefinedOptions = {
    tailwindcssBasedir: testCase.projectRoot,
    appType: testCase.appType,
    ...(testCase.resolveOptions?.(testCase.projectRoot) ?? {}),
  }

  const writeAndCollect = async (nextSource: string) => {
    await fs.writeFile(entryPath, nextSource, 'utf8')
    const { classSet } = await refreshRuntimeClassSet(options)
    return classSet
  }

  const createMutatedSource = (classLiteral: string, marker: string) => {
    if (mutationKind === 'template') {
      return insertBeforeClosingTag(
        original,
        testCase.template.closingTag,
        testCase.template.makeSnippet(classLiteral, marker),
      )
    }
    return testCase.script.applyClassLiteral(original, classLiteral)
  }

  try {
    const baseline = await refreshRuntimeClassSet(options)
    assertMissingAllTokens(baseline.classSet, addClassLiteral, `${testCase.title} ${mutationKind} baseline add`)
    assertMissingAllTokens(baseline.classSet, modifyClassLiteral, `${testCase.title} ${mutationKind} baseline modify`)

    const addedSet = await writeAndCollect(createMutatedSource(addClassLiteral, addMarker))
    assertHasAllTokens(addedSet, addClassLiteral, `${testCase.title} ${mutationKind} add`)

    const modifiedSet = await writeAndCollect(createMutatedSource(modifyClassLiteral, modifyMarker))
    assertHasAllTokens(modifiedSet, modifyClassLiteral, `${testCase.title} ${mutationKind} modify`)
    assertMissingAllTokens(modifiedSet, addClassLiteral, `${testCase.title} ${mutationKind} modify cleanup`)

    const deletedSet = await writeAndCollect(original)
    assertMissingAllTokens(deletedSet, addClassLiteral, `${testCase.title} ${mutationKind} delete add`)
    assertMissingAllTokens(deletedSet, modifyClassLiteral, `${testCase.title} ${mutationKind} delete modify`)

    const rollbackAddedSet = await writeAndCollect(createMutatedSource(addClassLiteral, addMarker))
    assertHasAllTokens(rollbackAddedSet, addClassLiteral, `${testCase.title} ${mutationKind} rollback re-add`)

    const rolledBackSet = await writeAndCollect(original)
    assertMissingAllTokens(rolledBackSet, addClassLiteral, `${testCase.title} ${mutationKind} rollback add`)
    assertMissingAllTokens(rolledBackSet, modifyClassLiteral, `${testCase.title} ${mutationKind} rollback modify`)
  }
  finally {
    await fs.writeFile(entryPath, original, 'utf8')
  }
}

const repositoryRoot = path.resolve(__dirname, '../../../..')
const uniAppViteV4DemoRoot = path.resolve(repositoryRoot, 'demo/uni-app-vite-tailwindcss-v4')

async function createIsolatedDemoCopy(sourceRoot: string) {
  const projectRoot = await fs.mkdtemp(path.join(repositoryRoot, 'demo/.tmp-weapp-tw-hmr-'))
  await fs.cp(sourceRoot, projectRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source)
      const parts = relative.split(path.sep)
      return !parts.some(part => part === 'node_modules' || part === 'dist' || part === '.turbo' || part === '.hbuilderx')
    },
  })
  await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(projectRoot, 'node_modules'), 'dir')
  return projectRoot
}

const cases: SourceMutationCase[] = [
  {
    title: 'demo/gulp-tailwindcss-v4',
    projectRoot: path.resolve(repositoryRoot, 'demo/gulp-tailwindcss-v4'),
    appType: 'native',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(path.resolve(repositoryRoot, 'demo/gulp-tailwindcss-v4')),
    resolveOptions: root => ({
      cssEntries: [path.resolve(root, 'src/app.css')],
    }),
    template: {
      entry: 'src/pages/index/index.wxml',
      closingTag: '</view>',
      makeSnippet: (classLiteral, marker) => `  <view class="${classLiteral}">${marker}</view>\n`,
    },
    script: {
      entry: 'src/pages/index/index.ts',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          '    classNames: "bg-[url(\'https://xxx.com/xx.webp\')] text-[#123456] text-[50px] bg-[#fff]",',
          `    classNames: '${classLiteral}',`,
          'demo/gulp-tailwindcss-v4 script anchor',
        )
      },
    },
  },
  {
    title: 'demo/uni-app-vite-tailwindcss-v4',
    projectRoot: uniAppViteV4DemoRoot,
    appType: 'uni-app-vite',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(uniAppViteV4DemoRoot),
    resolveOptions: root => ({
      cssEntries: [
        path.resolve(root, 'src/main.css'),
        path.resolve(root, 'src/sub-normal/pages/index.css'),
        path.resolve(root, 'src/sub-independent/pages/index.css'),
      ],
      tailwindcss: {
        v4: {
          cssSources: [
            {
              file: path.resolve(root, 'src/main.css'),
              css: readFileSync(path.resolve(root, 'src/main.css'), 'utf8'),
            },
            {
              file: path.resolve(root, 'src/common.css'),
              css: readFileSync(path.resolve(root, 'src/common.css'), 'utf8'),
            },
          ],
        },
      },
    }),
    template: {
      entry: 'src/pages/index/index.vue',
      closingTag: '</template>',
      makeSnippet: (classLiteral, marker) => `  <view class="${classLiteral}">${marker}</view>\n`,
    },
    script: {
      entry: 'src/pages/index/index.vue',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          'const className = ref(\'bg-[#0000ff] text-[45rpx] text-white\')',
          `const className = ref('${classLiteral}')`,
          'demo/uni-app-vite-tailwindcss-v4 script anchor',
        )
      },
    },
  },
  {
    title: 'demo/taro-vite-react-tailwindcss-v4',
    projectRoot: path.resolve(repositoryRoot, 'demo/taro-vite-react-tailwindcss-v4'),
    appType: 'taro',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(path.resolve(repositoryRoot, 'demo/taro-vite-react-tailwindcss-v4')),
    resolveOptions: root => ({
      cssEntries: [path.resolve(root, 'src/app.css')],
    }),
    template: {
      entry: 'src/pages/index/index.tsx',
      closingTag: '</View>',
      makeSnippet: (classLiteral, marker) => `      <View className='${classLiteral}'>${marker}</View>\n`,
    },
    script: {
      entry: 'src/pages/index/index.tsx',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          "<Text className='text-[55rpx] text-[#fff] bg-purple-300'>Hello world!</Text>",
          `<Text className='${classLiteral}'>Hello world!</Text>`,
          'demo/taro-vite-react-tailwindcss-v4 script anchor',
        )
      },
    },
  },
  {
    title: 'demo/taro-webpack-react-tailwindcss-v4',
    projectRoot: path.resolve(repositoryRoot, 'demo/taro-webpack-react-tailwindcss-v4'),
    appType: 'taro',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(path.resolve(repositoryRoot, 'demo/taro-webpack-react-tailwindcss-v4')),
    resolveOptions: root => ({
      cssEntries: [path.resolve(root, 'src/app.css')],
    }),
    template: {
      entry: 'src/pages/index/index.tsx',
      closingTag: '</>',
      makeSnippet: (classLiteral, marker) => `      <View className='${classLiteral}'>${marker}</View>\n`,
    },
    script: {
      entry: 'src/pages/index/index.tsx',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          "<View className='bg-[#534312] text-[#fff] text-[100rpx]'>",
          `<View className='${classLiteral}'>`,
          'demo/taro-webpack-react-tailwindcss-v4 script anchor',
        )
      },
    },
  },
  {
    title: 'demo/mpx-tailwindcss-v4',
    projectRoot: path.resolve(repositoryRoot, 'demo/mpx-tailwindcss-v4'),
    appType: 'mpx',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(path.resolve(repositoryRoot, 'demo/mpx-tailwindcss-v4')),
    resolveOptions: root => ({
      cssEntries: [path.resolve(root, 'src/app.css')],
    }),
    template: {
      entry: 'src/pages/index.mpx',
      closingTag: '</template>',
      makeSnippet: (classLiteral, marker) => `  <view class="${classLiteral}">${marker}</view>\n`,
    },
    script: {
      entry: 'src/custom-tab-bar/index.mpx',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          "    clsnm: 'bg-[#010101] active:bg-[#989898]'",
          `    clsnm: '${classLiteral}'`,
          'demo/mpx-tailwindcss-v4 script anchor',
        )
      },
    },
  },
  {
    title: 'demo/weapp-vite-tailwindcss-v4',
    projectRoot: path.resolve(repositoryRoot, 'demo/weapp-vite-tailwindcss-v4'),
    appType: 'native',
    createIsolatedProjectRoot: () => createIsolatedDemoCopy(path.resolve(repositoryRoot, 'demo/weapp-vite-tailwindcss-v4')),
    resolveOptions: (root) => {
      const file = path.resolve(root, 'tailwind.css')
      return {
        tailwindcss: {
          v4: {
            cssSources: [
              {
                file,
                base: root,
                css: normalizeTailwindSourceForGenerator(readFileSync(file, 'utf8'), {
                  importFallback: true,
                }),
                dependencies: [file],
              },
            ],
          },
        },
      }
    },
    template: {
      entry: 'pages/index/index.wxml',
      closingTag: '</scroll-view>',
      makeSnippet: (classLiteral, marker) => `  <view class="${classLiteral}">${marker}</view>\n`,
    },
    script: {
      entry: 'pages/index/index.ts',
      applyClassLiteral(source, classLiteral) {
        return replaceExact(
          source,
          '    message: \'Hello MINA!\',',
          `    message: '${classLiteral}',`,
          'demo/weapp-vite-tailwindcss-v4 script anchor',
        )
      },
    },
  },
]

describe('tailwindcss v4 source hmr regression', () => {
  for (const testCase of cases) {
    it(`${testCase.title} template add/modify/delete/rollback`, async () => {
      const projectRoot = testCase.createIsolatedProjectRoot
        ? await testCase.createIsolatedProjectRoot()
        : testCase.projectRoot
      try {
        await runMutationLifecycle({ ...testCase, projectRoot }, 'template')
      }
      finally {
        if (projectRoot !== testCase.projectRoot) {
          await fs.rm(projectRoot, { recursive: true, force: true })
        }
      }
    })

    it(`${testCase.title} script add/modify/delete/rollback`, async () => {
      const projectRoot = testCase.createIsolatedProjectRoot
        ? await testCase.createIsolatedProjectRoot()
        : testCase.projectRoot
      try {
        await runMutationLifecycle({ ...testCase, projectRoot }, 'script')
      }
      finally {
        if (projectRoot !== testCase.projectRoot) {
          await fs.rm(projectRoot, { recursive: true, force: true })
        }
      }
    })
  }

  it('demo/uni-app-vite-tailwindcss-v4 template add named arbitrary colors', async () => {
    const projectRoot = await createIsolatedDemoCopy(uniAppViteV4DemoRoot)
    const entryPath = path.resolve(projectRoot, 'src/pages/index/index.vue')
    const original = await fs.readFile(entryPath, 'utf8')
    const classLiteral = 'text-[yellow] bg-[blue]'
    const options: UserDefinedOptions = {
      tailwindcssBasedir: projectRoot,
      appType: 'uni-app-vite',
      cssEntries: [
        path.resolve(projectRoot, 'src/main.css'),
        path.resolve(projectRoot, 'src/sub-normal/pages/index.css'),
        path.resolve(projectRoot, 'src/sub-independent/pages/index.css'),
      ],
      tailwindcss: {
        v4: {
          cssSources: [
            {
              file: path.resolve(projectRoot, 'src/main.css'),
              css: readFileSync(path.resolve(projectRoot, 'src/main.css'), 'utf8'),
            },
            {
              file: path.resolve(projectRoot, 'src/common.css'),
              css: readFileSync(path.resolve(projectRoot, 'src/common.css'), 'utf8'),
            },
          ],
        },
      },
    }

    try {
      const baseline = await refreshRuntimeClassSet(options)
      assertMissingAllTokens(baseline.classSet, classLiteral, 'demo/uni-app-vite-tailwindcss-v4 named arbitrary baseline')

      const mutated = insertBeforeClosingTag(
        original,
        '</template>',
        `  <view class="${classLiteral}">named-arbitrary-hmr</view>\n`,
      )
      await fs.writeFile(entryPath, mutated, 'utf8')

      const added = await refreshRuntimeClassSet(options)
      assertHasAllTokens(added.classSet, classLiteral, 'demo/uni-app-vite-tailwindcss-v4 named arbitrary add')
    }
    finally {
      await fs.writeFile(entryPath, original, 'utf8').catch(() => {})
      await fs.rm(projectRoot, { recursive: true, force: true })
    }
  })
})
