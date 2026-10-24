const services = new Map([
  ['demo-mpx-tailwindcss-v4__mp-weixin', { packageName: '@mpxjs/mpx-cli-service', binName: 'mpx-cli-service' }],
  ['demo-uni-app-vite-tailwindcss-v4__mp-weixin', { packageName: '@dcloudio/vite-plugin-uni', binName: 'uni' }],
  ['demo-taro-vite-react-tailwindcss-v4__mp-weixin', { packageName: '@tarojs/cli', binName: 'taro', repositoryEntry: 'scripts/taro-build-runner.mjs' }],
])

export function getGcDiagnosticService(projectKey) {
  return services.get(projectKey)
}
