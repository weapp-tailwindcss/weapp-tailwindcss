export default defineAppConfig({
  pages: [
    'pages/index/index',
  ],
  subPackages: [
    {
      root: 'sub-normal',
      pages: ['pages/index/index'],
    },
    {
      root: 'sub-independent',
      pages: ['pages/index/index'],
      independent: true,
    },
  ],
  window: {
    navigationBarTitleText: 'style injector taro webpack',
  },
})
