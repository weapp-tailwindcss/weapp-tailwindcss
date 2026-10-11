let oxideImportPromise: ReturnType<typeof importOxide> | undefined

export function createOxideRuntimeDependencyError(cause: unknown) {
  return new Error(
    [
      '@weapp-tailwindcss/engine could not load @tailwindcss/oxide, which is required for source candidate scanning.',
      'This dependency should be installed automatically by @weapp-tailwindcss/engine.',
      'Reinstall dependencies without disabling optional dependencies, or install @tailwindcss/oxide@^4.3.3 manually if your package manager omitted it.',
    ].join(' '),
    { cause },
  )
}

async function importOxide() {
  try {
    return await import('@tailwindcss/oxide')
  }
  catch (error) {
    throw createOxideRuntimeDependencyError(error)
  }
}

export function getOxideModule() {
  oxideImportPromise ??= importOxide()
  oxideImportPromise.catch(() => {
    oxideImportPromise = undefined
  })
  return oxideImportPromise
}
