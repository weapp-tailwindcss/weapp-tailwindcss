# @weapp-tailwindcss/escape 基准

以下数据来自迁移前的固定上游提交，不代表本仓库重新测量的结果。

迁移后适配 Vitest 5，运行命令：`pnpm --filter @weapp-tailwindcss/escape bench`

| 场景 | 基准 hz | 优化后 hz | 变化 |
| --- | ---: | ---: | ---: |
| escape short selector (default map) | 492,441.14 | 523,014.25 | +6.2% |
| escape long selector (default map) | 14,723.98 | 15,748.50 | +7.0% |
| escape long selector (complex map) | 12,085.19 | 17,165.38 | +42.0% |
| unescape long selector (default map) | 43,580.17 | 43,065.91 | -1.2% |
| unescape long selector (complex map) | 6,672.61 | 6,352.27 | -4.8% |

> 说明：基准值为优化前首次跑分；优化后取最新跑分。unescape 轻微回退在运行误差范围内。***
