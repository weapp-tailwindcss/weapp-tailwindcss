module.exports = {
  hooks: {
    readPackage(pkg) {
      // UTS 发布元数据将 glibc 写成 gnu，pnpm 会因此跳过 Linux 原生依赖。
      if (pkg.name === '@dcloudio/uts-linux-x64-gnu' && pkg.libc?.includes('gnu')) {
        pkg.libc = pkg.libc.map(libc => libc === 'gnu' ? 'glibc' : libc)
      }
      return pkg
    },
  },
}
