---
"weapp-tailwindcss": patch
---

修复 Vite 生产 watch 中项目相对 CSS 来源被当作输出身份缓存，确保 SFC 作者样式的相对 reference 在连续重建时仍从源码目录解析。

统一 Rollup 资产元数据与 CSS 生命周期缓存的绝对来源归属，避免生产 watch 在内容 hash 改变后回放旧 CSS 资产并误删当前页面的边框 reset。

以 Vite root 识别已完成生成的 CSS 资产来源，首次完整构建复用框架已编译结果，避免 remembered apply 源码触发重复生成和局部规则重复合并；增量重建继续按候选与来源变化重新生成。
