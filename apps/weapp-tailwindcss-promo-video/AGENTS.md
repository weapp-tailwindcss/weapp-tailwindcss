# 品牌宣传片制作

## 适用范围
- 适用于本目录的双比例 Remotion 工程。

## 核心职责
- 输出中文与英文各自的横版 60 秒、竖版 30 秒宣传片、封面及字幕。

## 变更原则
- 横竖版各有独立时间轴，动效只由帧数驱动；共用正式品牌资产。
- 宣传主张以仓库 README 为依据，界面动画属于设计示意。
- 字体、配音与音频准备完成后，渲染仅消费本地素材。

## 测试要求
- 变更时间轴或媒体脚本时验证帧数、字幕边界、旁白时长和音频参数。
- 四个语言与画幅组合都检查转场、中段画面及最终成片；竖版关键文字避开顶部 180 px、底部 300 px、右侧 180 px。

## 推荐验证命令
- `pnpm --filter @weapp-tailwindcss/promo-video test`
- `pnpm --filter @weapp-tailwindcss/promo-video typecheck`
- `pnpm --filter @weapp-tailwindcss/promo-video verify`

## 提交前检查
- 检查素材来源与字体许可；不提交 out 或临时音频缓存。
- 记录实际执行的定向验证，不将宣传示意当作真实多端验收。
