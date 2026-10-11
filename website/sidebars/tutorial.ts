import type { SidebarConfig } from './types'

/**
 * @description 指南
 */
const tutorialSidebar: SidebarConfig = [
  {
    type: 'category',
    label: '快速开始',
    collapsed: false,
    items: [
      'intro',
      {
        type: 'doc',
        id: 'quick-start/install',
        label: '安装依赖',
      },
      {
        type: 'category',
        label: '各框架注册方式',
        collapsed: false,
        items: [
          {
            type: 'doc',
            id: 'quick-start/web',
            label: 'Web 直接使用',
            customProps: { frameworkLogo: 'html5' },
          },
          {
            type: 'doc',
            id: 'quick-start/react-native-expo',
            label: 'React Native / Expo',
            customProps: { frameworkLogo: 'expo' },
          },
          {
            type: 'doc',
            id: 'quick-start/frameworks/lynx',
            label: 'ReactLynx / Rspeedy',
            customProps: { frameworkLogo: 'lynx' },
          },
          {
            type: 'category',
            label: 'uni-app',
            collapsed: true,
            customProps: { frameworkLogo: 'uni-app' },
            items: [
              {
                type: 'doc',
                label: 'CLI Vue3 Vite',
                id: 'quick-start/frameworks/uni-app-vite',
                customProps: { frameworkLogo: 'vite' },
              },
              {
                type: 'doc',
                label: 'HBuilderX',
                id: 'quick-start/frameworks/hbuilderx',
                customProps: { frameworkLogo: 'hbuilderx' },
              },
              {
                type: 'doc',
                label: 'uni-app x',
                id: 'quick-start/frameworks/uni-app-x',
                customProps: { frameworkLogo: 'uni-app-x' },
              },
            ],
          },
          {
            type: 'category',
            label: 'Taro',
            collapsed: true,
            customProps: { frameworkLogo: 'taro' },
            items: [
              {
                type: 'doc',
                label: 'Webpack / Vite',
                id: 'quick-start/frameworks/taro',
                customProps: { frameworkLogo: 'taro' },
              },
            ],
          },
          {
            type: 'category',
            label: 'Weapp-vite',
            collapsed: true,
            customProps: { frameworkLogo: 'weapp-vite' },
            items: [
              {
                type: 'doc',
                label: '快速接入',
                id: 'quick-start/native/install',
                customProps: { frameworkLogo: 'weapp-vite' },
              },
              {
                type: 'doc',
                label: '打包方案说明',
                id: 'quick-start/frameworks/native',
                customProps: { frameworkLogo: 'weapp-vite' },
              },
            ],
          },
          {
            type: 'category',
            label: 'Mpx',
            collapsed: true,
            customProps: { frameworkLogo: 'mpx' },
            items: [
              {
                type: 'doc',
                label: 'Mpx',
                id: 'quick-start/frameworks/mpx',
                customProps: { frameworkLogo: 'mpx' },
              },
            ],
          },
          {
            type: 'doc',
            id: 'quick-start/frameworks/api',
            customProps: { frameworkLogo: 'nodejs' },
          },
        ],
      },
    ],
  },
  {
    type: 'category',
    label: '工具与 CLI',
    collapsed: true,
    items: [
      {
        type: 'doc',
        id: 'tools/weapp-tw-cli',
      },
    ],
  },
  {
    type: 'category',
    label: '框架配置参考',
    collapsed: false,
    items: [
      {
        type: 'doc',
        id: 'config/uni-app-x',
        key: 'config-uni-app-x',
        label: 'uni-app x',
        customProps: { frameworkLogo: 'uni-app-x' },
      },
      {
        type: 'doc',
        id: 'config/react-lynx',
        key: 'config-react-lynx',
        label: 'ReactLynx / Rspeedy',
        customProps: { frameworkLogo: 'lynx' },
      },
      {
        type: 'doc',
        id: 'config/react-native',
        key: 'config-react-native',
        label: 'React Native / Expo',
        customProps: { frameworkLogo: 'expo' },
      },
    ],
  },
  {
    type: 'category',
    label: '兼容与进阶',
    collapsed: true,
    items: [
      'multi-platform',
      'quick-start/intelliSense',
      'quick-start/css-unit-transform',
      {
        type: 'doc',
        id: 'options/exports',
        label: '包导出总览',
      },
    ],
  },
  {
    type: 'category',
    label: '社区与贡献',
    collapsed: true,
    items: [
      {
        type: 'doc',
        id: 'community/templates',
        label: '模板项目',
      },
      'community',
      'how-to-contribute',
      {
        type: 'link',
        href: 'https://github.com/sonofmagic/weapp-tailwindcss/issues/270',
        label: '谁在使用？',
      },
    ],
  },
]

export default tutorialSidebar
