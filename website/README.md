# Weapp-tailwindcss Website

docusaurus + tailwindcss

## 启动项目

```bash
# 安装依赖
pnpm install

# 启动项目
pnpm dev
```

## Playwright 截图测试

Playwright 用来对官网的所有路由做截图回归，现在同时覆盖桌面视口与移动端（Chromium 模拟 iPhone 12）。默认会访问生产站点 `https://tw.weapp.dev/`，也可以通过 `PLAYWRIGHT_BASE_URL` 指定自己的预览地址（例如 `http://192.168.10.4:4000/`）来验证局域网环境。

```bash
# 在仓库根目录执行
pnpm --filter @weapp-tailwindcss/website e2e

# 指定移动端验证地址（如 192.168.10.4:4000）
PLAYWRIGHT_BASE_URL=http://192.168.10.4:4000 pnpm --filter @weapp-tailwindcss/website e2e
```

### 本地黄金图的采集与审查

`e2e:local` 先以 `e2e:visual:test` 验证真实三浏览器基线管线，在启动受管本地 Worker 前验证黄金图及来源登记，再以三浏览器、零重试、`--update-snapshots=none` 比较。三浏览器管线在 Website SEO Quality 的独立 job 中执行，普通 unit 不依赖 Firefox/WebKit。首次使用或渲染环境变化时，先生成并审查候选；不能把失败截图直接登记为预期。PNG 体积较大，不加入 Git；来源清单和审查记录登记在 `tests/visual-baselines/<platform>*.json`，完整候选目录及归档须另行保留。

```bash
# 仓库根目录执行；先提交本任务源码，采集入口自动生产构建，期间不同时修改或重建依赖
pnpm --filter @weapp-tailwindcss/website e2e:visual capture --directory ../.tmp/website-visual-candidate

# 查看实际 PNG，审查三引擎、移动布局和代表性长页，保存接触表或原图证据
pnpm --filter @weapp-tailwindcss/website e2e:visual review --directory ../.tmp/website-visual-candidate --reviewer 维护者 --notes 已检查颜色、布局与完整页面 --evidence ../.tmp/website-visual-review.png
pnpm --filter @weapp-tailwindcss/website e2e:visual install --directory ../.tmp/website-visual-candidate
pnpm --filter @weapp-tailwindcss/website e2e:visual verify
pnpm --filter @weapp-tailwindcss/website e2e:local
```

候选必须是全新目录。范围来自 `routes.json`：桌面 Chromium、Firefox、WebKit 与移动 Chromium 全部首次成功，移动 Firefox/WebKit 保留既有显式跳过。每张图的名字来自 Playwright 原生报告附件，校验完整集合、PNG 内容和尺寸。采集期间源码、锁文件和实际构建不能变化；失败只留下诊断，不生成可安装清单。审查绑定当前清单 hash 与真实 PNG 证据，安装采用同父目录暂存和原子重命名；来源不明或已有其他基线的目标目录会拒绝覆盖。需替换已有黄金图时，先确认归属并单独归档，重新采集和审查。

视觉夹具对显式 `.gif` 网络图片地址采用固定首帧合同：实际成功响应须由 MIME 或字节签名确认为 GIF，再经显式版本的 sharp/libvips 解码第 0 帧，PNG 保留该帧颜色和尺寸；失败 HTTP 状态及静态图片字节保持可观察。报告附件登记原始 GIF 与 PNG 摘要，渲染环境登记解码器版本。其他图片保留真实请求与重定向，最终字节检查发现未冻结 GIF 时明确拒绝采集；GIF 地址的重定向也拒绝，避免改写跨源语义。此项只比较 GIF 首帧，动画时序需单独验证；data/blob 图片不属于网络响应规范化范围。响应拦截会禁用这些独立视觉 context 的浏览器 HTTP 缓存，缓存行为由功能回归覆盖。

黄金图记录历史源码和构建，不要求未来 HEAD 相同；未来代码仍须比较像素。操作系统、架构、系统版本、Playwright/浏览器、图片解码器版本或截图合同变化会阻断，不能静默沿用其他环境的旧图。完整本地验收仍须先完成仓库本轮扩展预检、当前会话 computer use 与 verify，此处单独采集网站候选不能替代该门禁。

整页截图在图片准备并恢复原滚动位置后，还会只读核对可见动态 TOC 的高亮语义。navbar 策略和有效 heading 范围来自本次 `.docusaurus` 生成配置及 docs/blog/pages 路由 metadata 的 frontmatter；全部范围内标题按 DOM 顺序参与上游算法，当前标题没有 TOC 链接时允许无高亮。隐藏的移动端 TOC 不参与检查；可见 TOC 的目标缺失、结构未知或路由 metadata 缺失不能放行。检查与图片及截图共用原有截止时间，不触发 scroll/resize、不改 class；失败保留 `full-page-toc-observation` 附件。实际读取的 TOC metadata 摘要纳入采集前后的构建身份，临时生成文件不纳入。

原生截图的捕获期观察覆盖 Playwright 准备、采集与恢复全过程。除链接自身外，还按真实祖先链去重核对节点归属、完整 computed style、裁剪参考框与滚动几何及未完成动画，避免祖先透明度、滤镜、裁剪或混合改变实际绘制而子链接状态不变。document 级 mutation 历史保留临时属性变化，恢复后的终态不能抹去扰动；共享祖先每帧只读一次完整属性。观察器不修改生产样式或动画状态，失败仍使用原有截止时间，且必须重新获得两个完整、未受扰动、RGBA 严格相同的样本。

TOC 前置条件属于截图合同变更，不能沿用旧合同身份登记新图。原 inactive 截图的形成原因尚未确定；不能据此声称是字体缺陷，也不能只因新状态重复出现就接受。先检查受影响路由的新候选及语义差异，再按上面的采集、审查、安装流程重建来源，最后用 `--update-snapshots=none` 复验。证据与边界见 [TOC 截图就绪复盘](../docs/engineering/lessons/website-toc-readiness.md)。

## 报错解决

Module not found: Error: Can't resolve '@weapp-tailwindcss/merge' in '/Users/zzy/Projects/weapp-tailwindcss/website/src/theme/ReactLiveScope'

```bash
# 本地编译，cd 到根目录下

pnpm build

```

<https://tw.weapp.dev/>

## GitHub Actions 文档部署

网站构建和上传由 `.github/workflows/docs.yml`（Deploy Docs Worker）执行。`main` 每次推送自动运行，也可在 Actions 页面从 `main` 手动重部署。生产 Worker 为 `weapp-tailwindcss`，主域名为 `https://tw.weapp.dev`。`.github/workflows/docs-next.yml`（Deploy Next Docs Worker）在相同触发条件下构建固定预览站，使用现有 `wrangler.jsonc` 的 `env.next`、Worker `weapp-tailwindcss-next` 和 `https://next.tw.weapp.dev`。两个目标分别串行部署，均只允许最新 `main`。

工作流使用 Node 24、根目录声明的 pnpm 和锁定版本的 Wrangler，在 GitHub runner 中完成受众检查、关键词检查、中英文构建、SEO 严格检查、本地 Worker 路由测试及 dry-run，再直接上传产物。该过程不使用 Cloudflare Builds 构建额度。

维护者需完成以下配置：

- 组织级 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 对本仓库开放，并移除仓库中这两项同名旧 Secret，避免仓库值覆盖组织值。Token 需要目标账户的 Worker 上传及现有 Custom Domain 管理权限；仅有 Builds 权限不足以部署。
- 在生产及预览 Worker 的 **Settings → Builds** 停用自动构建或断开 Git 构建连接，保留 Worker、域名及线上版本，避免恢复额度后重复部署。Actions 部署不需要 Cloudflare GitHub App。
- Cloudflare 凭据仅传给上传步骤。缺少凭据、远端 main 无法读取或任何质量检查失败都会阻止上传。过期提交跳过部署；每个目标的固定并发组保证一次只有一个部署，且不会取消进行中的上传。两个工作流均复用上述全部质量门禁。

上传步骤日志记录部署前的 Worker 版本和 Wrangler 返回的新版本。随后 `verify:deployment` 核对中英文页面、canonical、站点地图、机器可读内容、301/404，以及 `build/assets` 和各语言输出目录中全部 JS、CSS、字体、媒体等资源和社交图片与本次构建的 SHA-256。资源请求最多并发 8 个，失败后停止新请求并等待在途请求结束。验证命令必须显式指定 `--target production` 或 `--target next`，以对应主域核对 canonical，防止混用构建。只有上传和验收都成功，才算部署完成。手动运行同样只能部署最新 `main`。

next 的双语页面、结构化数据和机器索引均使用 `https://next.tw.weapp.dev`。预览 HTML 带 `robots: noindex, nofollow`，`robots.txt` 禁止所有爬虫，静态响应带 `X-Robots-Tag: noindex, nofollow`，不生成双语 sitemap；统计入口只在正式主域构建和正式来源运行时启用。此索引策略不提供访问控制。

若上传后验收失败，先停用对应 Deploy Docs Worker 或 Deploy Next Docs Worker 工作流阻止后续上传，再根据日志定位问题；必要时使用 Wrangler 将对应 Worker 回退到上传前版本（next 加 `--env next`），修复并验证后再启用 Actions，不恢复 Connected Builds。

本地构建及部署命令保持可用：先执行 `pnpm build:docs:cloudflare` 完成生产构建与检查，再执行 `pnpm deploy:docs:cloudflare` 上传并验收。`pnpm deploy:docs:cloudflare:next` 为本地手动预览入口。仅构建和验收 next 而不上传时，执行 `pnpm --filter @weapp-tailwindcss/website build:next`、`pnpm --filter @weapp-tailwindcss/website test:worker -- --target next` 和 `pnpm --filter @weapp-tailwindcss/website deploy:worker:next:dry-run`。生产构建继续使用原默认命令。

## Cloudflare 域名迁移

生产 Worker 通过 `wrangler.jsonc` 的 Custom Domain 使用 `tw.weapp.dev`。固定预览 Worker 通过 `env.next` 的 Custom Domain 使用 `next.tw.weapp.dev`。首次上线需在 Cloudflare 确认两个目标的域名绑定及证书均生效。旧 hostname 保持 Cloudflare 代理和证书，在 Cloudflare **Rules → Redirect Rules** 中配置以下永久重定向，并开启保留 query string：

```text
http*://tw.icebreaker.top/*     -> https://tw.weapp.dev/${2}       (301)
http*://weapp-tw.icebreaker.top/* -> https://tw.weapp.dev/${2}     (301)
http*://next.tw.icebreaker.top/* -> https://next.tw.weapp.dev/${2} (301)
```

先部署并验证新域，再启用旧域重定向。迁移验收命令如下：

```bash
pnpm --filter @weapp-tailwindcss/website verify:domain-migration
```

## Showcase 数据同步

`docs/showcase` 页面由 `scripts/update-showcase.ts` 生成，会从 [issue #270](https://github.com/sonofmagic/weapp-tailwindcss/issues/270) 采集最新的文本与截图/二维码。脚本会把 **所有** 附件下载到 `website/static/img/showcase/<序号.小程序名称>/` 下：页面优先把识别到的小程序码/二维码作为主图展示，其余图片全部收起到作品截图里，可通过配置文件手动筛选或隐藏。只有填写了「小程序名称」字段的评论才会被收录，其余会在脚本执行时输出警告。

```bash
# 在仓库根目录执行
pnpm showcase:update
```

> 建议在运行前导出 `GITHUB_TOKEN`（或 `GH_TOKEN`）以提升 GitHub API 额度。脚本会清空 `website/static/img/showcase` 后重新下载所有图片，因此请勿在该目录放置其他静态资源。你也可以在 CI/cron 中周期性执行上面的命令，让官网自动获得最新的展示内容。

若本机安装了 Python 版 OpenCV contrib（例如 `opencv-contrib-python-headless`），同步脚本会调用 `scripts/scan-wechat-qrcode.py`，优先用 `cv2.wechat_qrcode_WeChatQRCode` 识别普通二维码，并用 OpenCV 图形特征检测微信小程序码。未安装 OpenCV 时脚本会自动降级为图片尺寸兜底，不会阻塞页面生成。

可选环境变量：

- `SHOWCASE_SKIP_IMAGES=1`：仅更新文案，跳过图片下载（比如在无外网的环境调试）。
- `SHOWCASE_IMAGE_TIMEOUT=20000`：单张图片的超时时间，单位 ms。
- `SHOWCASE_IMAGE_RETRY=3`：下载失败时的重复次数。
- `SHOWCASE_REPO`、`SHOWCASE_ISSUE`：若需要同步其他仓库/Issue，可覆盖默认值 `weapp-tailwindcss/weapp-tailwindcss` 与 `270`。
- `SHOWCASE_PROXY`：需要走代理抓取 GitHub API/图片时设置，例如 `SHOWCASE_PROXY=http://127.0.0.1:7890`。若未设置则会自动默认 `http://127.0.0.1:7890`，再依次尝试读取 `HTTPS_PROXY` / `HTTP_PROXY`。

### 手动控制展示的作品 & 图片

运行脚本后，可编辑 `website/docs/showcase/config.json` 来手动隐藏作品或指定要展示的图片：

```json
{
  "entries": {
    "009.qubaibai": {
      "hidden": false,
      "images": [
        "qrcode.jpg", // 也可以填 `/img/showcase/009.qubaibai/qrcode.jpg`
        "https://example.com/..." // 或者直接使用原始的远程 URL
      ]
    },
    "010.example": {
      "hidden": true
    }
  }
}
```

- `hidden: true` 会直接跳过该作品。
- `images` 用来精确指定要展示的图片，支持填写下载后的文件名、`/img/...` 路径或原始远程 URL；如果不设置就会展示该作品的全部附件。

脚本默认展示所有图片，并以「链接」字段的文本作为卡片标题（若未填写则回退到评论中的名称）。配置文件可以满足“由我来决定哪些小程序和图片被隐藏”的需求。
