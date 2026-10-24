const services = new Map([
  ['demo-mpx-tailwindcss-v4__mp-weixin', { packageName: '@mpxjs/mpx-cli-service', binName: 'mpx-cli-service' }],
  ['demo-uni-app-vite-tailwindcss-v4__mp-weixin', { packageName: '@dcloudio/vite-plugin-uni', binName: 'uni' }],
])

export function getGcDiagnosticService(projectKey) {
  return services.get(projectKey)
}
