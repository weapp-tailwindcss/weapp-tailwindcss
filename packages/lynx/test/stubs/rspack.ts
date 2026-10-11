export class WeappTailwindcss {
  constructor(_options: unknown) {}
}

export function patchRspackConfig(config: any, options: any = {}) {
  const cssImportRewriteLoader = options.cssImportRewriteLoader ?? true
  if (cssImportRewriteLoader === false) {
    return config
  }
  const loaderOptions = cssImportRewriteLoader === true
    ? undefined
    : cssImportRewriteLoader
  for (const rule of config.module?.rules ?? []) {
    const use = Array.isArray(rule.use) ? rule.use : []
    if (use.some((item: any) => String(item.loader).includes('weapp-tw-css-import-rewrite-loader'))) {
      continue
    }
    const index = use.findIndex((item: any) => item.loader === 'builtin:lightningcss-loader')
    if (index !== -1) {
      use.splice(index + 1, 0, {
        loader: loaderOptions?.loader ?? '/virtual/weapp-tw-css-import-rewrite-loader.cjs',
        ...(loaderOptions?.options === undefined
          ? {}
          : { options: loaderOptions.options }),
      })
    }
  }
  return config
}
