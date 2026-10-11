import type { SidebarConfig } from './types'

/**
 * @description 生态以及解决方案
 */
const communitySidebar: SidebarConfig = [
  {
    type: 'doc',
    id: 'community/templates',
  },
  {
    type: 'doc',
    id: 'reference/support-matrix',
  },
  {
    type: 'doc',
    id: 'icons/index',
  },
  {
    type: 'category',
    label: 'packages-runtime',
    collapsed: false,
    items: [
      'community/packages-runtime/index',
      'community/packages-runtime/merge',
      'community/packages-runtime/cva',
      'community/packages-runtime/variants',
      'community/packages-runtime/multi-platform-demos',
    ],
  },
  {
    type: 'doc',
    id: 'quick-start/apply-themes',
  },
  {
    type: 'doc',
    id: 'quick-start/uni-app-css-macro',
  },
  {
    type: 'doc',
    label: '独立分包',
    id: 'quick-start/independent-pkg',
  },

  {
    type: 'doc',
    id: 'community/load-font',
  },
  {
    type: 'doc',
    label: 'wxs 的转义与处理',
    id: 'quick-start/wxs',
  },
  {
    type: 'doc',
    id: 'community/group',
  },
  // {
  //   type: 'doc',
  //   id: 'community/consult'
  // },
  {
    type: 'doc',
    id: 'community/plugins',
  },
]

export default communitySidebar
