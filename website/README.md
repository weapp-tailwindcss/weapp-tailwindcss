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

## 报错解决

Module not found: Error: Can't resolve '@weapp-tailwindcss/merge' in '/Users/zzy/Projects/weapp-tailwindcss/website/src/theme/ReactLiveScope'

```bash
# 本地编译，cd 到根目录下

pnpm build

```

<https://tw.weapp.dev/>

## GitHub Actions 生产部署

网站构建和上传由 `.github/workflows/docs.yml`（Deploy Docs Worker）执行。`main` 每次推送自动运行，也可在 Actions 页面从 `main` 手动重部署。生产 Worker 仍为 `weapp-tailwindcss`，主域名仍为 `https://tw.weapp.dev`；预览 Worker 本次不自动部署。

工作流使用 Node 24、根目录声明的 pnpm 和锁定版本的 Wrangler，在 GitHub runner 中完成受众检查、关键词检查、中英文构建、SEO 严格检查、本地 Worker 路由测试及 dry-run，再直接上传产物。该过程不使用 Cloudflare Builds 构建额度。

维护者需完成以下配置：

- 组织级 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 对本仓库开放，并移除仓库中这两项同名旧 Secret，避免仓库值覆盖组织值。Token 需要目标账户的 Worker 上传及现有 Custom Domain 管理权限；仅有 Builds 权限不足以部署。
- 在生产及预览 Worker 的 **Settings → Builds** 停用自动构建或断开 Git 构建连接，保留 Worker、域名及线上版本，避免恢复额度后重复部署。Actions 部署不需要 Cloudflare GitHub App。
- Cloudflare 凭据仅传给上传步骤。缺少凭据、远端 main 无法读取或任何质量检查失败都会阻止上传。过期提交跳过部署；固定并发组保证一次只有一个生产部署，且不会取消进行中的上传。

上传步骤日志记录部署前的 Worker 版本和 Wrangler 返回的新版本。随后 `verify:deployment` 核对中英文页面、canonical、站点地图、机器可读内容、301/404，以及线上 CSS/社交图片与本次构建的 SHA-256。只有上传和验收都成功，才算部署完成。手动运行同样只能部署最新 `main`。

若上传后验收失败，先停用 Deploy Docs Worker 工作流阻止后续上传，再根据日志定位问题；必要时使用 Wrangler 将生产 Worker 回退到上传前版本，修复并验证后再启用 Actions，不恢复 Connected Builds。

本地构建及部署命令保持可用：先执行 `pnpm build:docs:cloudflare` 完成生产构建与检查，再执行 `pnpm deploy:docs:cloudflare` 上传并验收。`pnpm deploy:docs:cloudflare:next` 为独立的手动预览入口，使用前需单独确认预览域名和权限。

## Cloudflare 域名迁移

生产 Worker 通过 `wrangler.jsonc` 的 Custom Domain 使用 `tw.weapp.dev`。配置中的预览域名为 `next.tw.weapp.dev`，本次不接通预览部署。旧 hostname 保持 Cloudflare 代理和证书，在 Cloudflare **Rules → Redirect Rules** 中配置以下永久重定向，并开启保留 query string：

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
