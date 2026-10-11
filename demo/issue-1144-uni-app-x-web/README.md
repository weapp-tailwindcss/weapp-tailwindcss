## Issue #1144 uni-app x Web HMR 复现项目

此目录完整保留 [Gitee 复现仓库](https://gitee.com/my_hujinchen/weapp-tailwind-test-uniappx) 的页面与主题源码，登记为 [weapp-tailwindcss#1144](https://github.com/sonofmagic/weapp-tailwindcss/issues/1144) 的独立回归 demo。

demo 默认保留经典 UTS Options 写法。原始 `script setup lang="uts"` 脚本位于 `e2e/fixtures/issue-1144`，alpha 专项用例临时替换 App 与首页脚本，运行后恢复。2026-09-08 的 HBuilderX 5.25 alpha 实测两种写法均完成 16 轮保存及两次刷新；CLI 生产构建也覆盖两种写法。此前的 descriptor 失败记录不能作为 setup 普遍不受支持的结论。

### 复现步骤

1. 使用根 package.json engines 指定的 Node.js 版本 和 HBuilderX（包含 uni-app x Web 工具链）安装仓库依赖。
2. 在仓库根目录执行 `pnpm --filter @weapp-tailwindcss-demo/issue-1144-uni-app-x-web run dev:h5`。真实 HBuilderX 回归分别运行 `HBUILDERX_CHANNEL=stable E2E_HBUILDERX_CASE=issue-1144-uni-app-x-web pnpm e2e:hbuilderx:h5` 和 `HBUILDERX_CHANNEL=alpha E2E_HBUILDERX_CASE=issue-1144-uni-app-x-web pnpm e2e:hbuilderx:h5`；同时固定 `HBUILDERX_HOST`，不要终止其他任务持有的 IDE 会话。
3. 打开首页后编辑 `pages/index/index.uvue` 模板中的文字并保存。页面中的探针同时覆盖直接使用 `class="mt-24!"`，以及 `:pt="{ root: 'p-0!' }"` 依次改为 `p-10!`、`p-4!`、再改回 `p-0!` 的三轮 Web HMR。

首次加载和保存后的 HMR 页面都应正常更新；Vite 页面不应出现错误遮罩，HBuilderX/Vite 日志不应出现 `Unknown word` 或 `[plugin:vite:css]` PostCSS 警告，生成 CSS 也不应残留 Tailwind 原始指令。

### 原始 setup 的 alpha 回归

从仓库根目录运行：

```sh
pnpm exec cross-env CI=1 HBUILDERX_CHANNEL=alpha HBUILDERX_HOST=HBuilderX E2E_ISSUE_1144_ALPHA=1 E2E_HBUILDERX_WEB_TIMEOUT_MS=45000 pnpm exec vitest run -c e2e/vitest.e2e.config.ts e2e/issue-1144-alpha.test.ts --update=none
```

该用例检查真正消费 `pt.root` 的组件、important 竞争样式、style 块切换与每轮 marker。公开仓库完整第三方组件包仍不在本回归范围内。

### 在 UTS 中读取主题变量

主题只需在 `main.css` 中维护。构建和热更新时会自动生成 `theme.uts`：

```uts
import { getThemeValue } from '@/theme.uts'

const radius = getThemeValue('--radius-xl')
const pageColor = getThemeValue('--theme-page')
console.log(radius.value) // 12px
```

`getThemeValue()` 返回 `ComputedRef<string>`。`@theme` 中的公共 token 返回声明值；`--theme-*` 变量会根据当前 `themeClass` 自动更新为 `.light`、`.dark` 或对应皮肤类中的具体值。在脚本中通过 `.value` 读取，在模板中会自动解包；变量不存在时会输出警告并返回空字符串。

### 多皮肤与暗黑模式

运行时主题位于 `stores/theme.uts`，支持 `default`、`ocean` 两套皮肤，以及浅色、深色、跟随系统三种模式：

```uts
import { setThemeMode, setThemeSkin, useTheme } from '@/stores/theme.uts'

const theme = useTheme()
setThemeSkin('ocean')
setThemeMode('system')
```

页面根节点绑定最终主题类，组件使用引用 CSS 变量的稳定语义类：

```vue
<view :class="[theme.themeClass, 'bg-page']">
	<view class="border border-line bg-surface">
		<text class="text-content">内容</text>
	</view>
</view>
```

`light`、`dark`、`ocean-light`、`ocean-dark` 在 `main.css` 中维护相同的 `--theme-*` 变量；`@theme inline` 将它们映射为 `bg-page`、`text-content`、`border-line` 等 Tailwind 类。新增页面时必须在页面根 `view` 或 `scroll-view` 绑定 `theme.themeClass`，新增皮肤时必须补齐全部语义变量。
