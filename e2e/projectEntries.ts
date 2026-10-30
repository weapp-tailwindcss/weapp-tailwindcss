import type { ProjectEntry } from './shared.ts'
import process from 'node:process'

export const E2E_PROJECTS = ([
  {
    name: 'gulp-tailwindcss-v4',
    projectPath: 'gulp-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
    ],
  },
  {
    name: 'mpx-tailwindcss-v4',
    projectPath: 'mpx-tailwindcss-v4/dist/wx',
    cssFile: 'app.wxss',
    url: '/pages/index',
  },
  {
    name: 'taro-webpack-react-tailwindcss-v4',
    projectPath: 'taro-webpack-react-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
      'dist/pages/issue-998/index.wxss',
    ],
    extraSnapshots: ['issue-909-transform'],
    url: '/pages/issue-909/index',
  },
  {
    name: 'taro-vite-react-tailwindcss-v4',
    projectPath: 'taro-vite-react-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
      'dist/pages/issue-998/index.wxss',
    ],
  },
  {
    name: 'taro-webpack-vue3-tailwindcss-v4',
    projectPath: 'taro-webpack-vue3-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
    ],
  },
  {
    name: 'taro-vite-vue3-tailwindcss-v4',
    projectPath: 'taro-vite-vue3-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
    ],
  },
  {
    name: 'uni-app-vite-tailwindcss-v4',
    projectPath: 'uni-app-vite-tailwindcss-v4/dist/build/mp-weixin',
    cssFile: 'app.wxss',
    cssFiles: [
      'app.wxss',
      'main.wxss',
      'sub-normal/pages/index.wxss',
      'sub-independent/pages/index.wxss',
    ],
    buildEnv: {
      WEAPP_TW_ISSUE_1005_FINAL_CSS_FIXTURE: '1',
    },
  },
  {
    name: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4',
    projectPath: 'uni-app-vite-vue3-hbuilderx-tailwindcss-v4/unpackage/dist/dev/mp-weixin',
    cssFile: 'app.wxss',
    requiresHBuilderX: true,
  },
  {
    name: 'uni-app-x-vdom-tailwindcss-v4',
    theme: { manualClass: 'dark_cbg-_b_h3498db_B', backgroundColor: [52, 152, 219], scrollContainer: '.content-scroll' },
    projectPath: 'uni-app-x-vdom-tailwindcss-v4/unpackage/dist/dev/mp-weixin',
    cssFile: 'app.wxss',
    requiresHBuilderX: true,
  },
  {
    name: 'weapp-vite-tailwindcss-v4',
    projectPath: 'weapp-vite-tailwindcss-v4',
    cssFile: 'dist/app.wxss',
    cssFiles: [
      'dist/app.wxss',
      'dist/sub-normal/pages/index.wxss',
      'dist/sub-independent/pages/index.wxss',
    ],
  },
] satisfies ProjectEntry[]).map(entry => ({
  ...entry,
  forbidEmptyBlockAtRules: true,
})) satisfies ProjectEntry[]

export const NATIVE_PROJECTS = [] satisfies ProjectEntry[]

function cloneProject(projects: ProjectEntry[], name: string): ProjectEntry {
  const project = projects.find(entry => entry.name === name)
  if (!project) {
    throw new Error(`Unknown project: ${name}`)
  }
  return {
    ...project,
  }
}

export function getE2EProject(name: string): ProjectEntry {
  return cloneProject(E2E_PROJECTS, name)
}

export function getNativeProject(name: string): ProjectEntry {
  return cloneProject(NATIVE_PROJECTS, name)
}

export function isE2EProjectSupportedOnPlatform(
  project: ProjectEntry,
  platform: NodeJS.Platform = process.platform,
) {
  if (!project.requiresHBuilderX) {
    return true
  }

  // Hosted runners do not provide HBuilderX. Keep the local macOS/Windows
  // coverage available, while allowing workflows to explicitly skip these
  // local-only projects without changing the matrix contract.
  if (process.env['E2E_SKIP_HBUILDERX'] === '1') {
    return false
  }

  return platform !== 'linux'
}
