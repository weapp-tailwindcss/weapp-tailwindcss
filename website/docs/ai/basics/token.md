---
sidebar: aiSidebar
title: Token（词元）
description: Token（词元），覆盖 AI 工作流、提示词和工程化实践。
keywords:
  - AI 编程
  - LLM
  - 工作流
  - Token
  - 词元
  - ai
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - 小程序
  - 微信小程序
  - uni-app
  - taro
  - mpx
---

# Token（词元）

## 概述

**Token** 是大语言模型（LLM）处理文本的**基本单位**。不同于人类理解的"单词"或"字符"，Token 是模型内部使用的最小语义单元。

> **核心概念**：1 Token ≈ 0.75 个英文单词 ≈ 4 个字符 ≈ 2-3 个汉字

---

## Token 的本质

### 1. 什么是 Token

Token 是将文本切分成的**序列片段**：

```
输入文本: "Hello, world!"
Token序列: ["Hello", ",", "world", "!"]
Token数量: 4
```

### 2. 分词 (Tokenization)

将文本转换为 Token 序列的过程：

```python
# GPT 分词示例
text = "Artificial Intelligence is amazing"
tokens = ["Art", "ificial", " Int", "elligence", " is", " am", "azing"]
# 7 tokens

# Claude 分词示例
text = "Artificial Intelligence is amazing"
tokens = ["Art", "ificial", " Intelligence", " is", " amazing"]
# 5 tokens（不同模型分词不同）
```

### 3. 字节对编码 (BPE)

主流的 Tokenization 方法：

```
原始: "unbelievable"
步骤1: u n b e l i e v a b l e (字符级)
步骤2: un bel ieve able (词级+字符级混合)
步骤3: ["un", "believable"] (最终Token)
```

---

## Token 的计数规则

### 1. 英文文本

| 文本类型 | Token 估算 |
| -------- | ---------- |
| 1 个单词 | ~1.3 tokens |
| 1 个句子 (15词) | ~20 tokens |
| 1 段落 (100词) | ~130 tokens |
| 1 页文档 (500词) | ~650 tokens |

### 2. 中文文本

| 文本类型 | Token 估算 |
| -------- | ---------- |
| 1 个汉字 | ~0.5-1 token |
| 1 个词 (2-3字) | ~1-2 tokens |
| 1 个句子 (20字) | ~10-15 tokens |
| 1 段落 (100字) | ~50-70 tokens |

### 3. 代码

| 代码类型 | Token 估算 |
| -------- | ---------- |
| 1 行简单代码 | ~10-20 tokens |
| 1 行复杂代码 | ~30-50 tokens |
| 1 个函数 (50行) | ~300-500 tokens |
| 1 个文件 (500行) | ~3000-5000 tokens |

### 4. 特殊场景

| 场景 | Token 计数 |
| ---- | ---------- |
| 空格 | 1 token |
| 换行 | 1 token |
| 缩进 (2空格) | 1 token |
| 制表符 | 1 token |
| 数字 (12345) | 1-2 tokens |
| URL | ~10-20 tokens |

---

## 各模型的 Token 限制

### 上下文窗口 (Context Window)

| 模型 | 上下文长度 | 输出限制 |
| ---- | ---------- | -------- |
| **Claude Opus 4.5** | 200K tokens | ~8K 输出 |
| **Claude Sonnet 4.5** | 200K tokens | ~8K 输出 |
| **GPT-4o** | 128K tokens | ~4K 输出 |
| **GPT-5.2** | 1M tokens | ~8K 输出 |
| **Gemini 2.0 Pro** | 2M tokens | ~8K 输出 |
| **Gemini 1.5 Pro** | 1M tokens | ~8K 输出 |
| **GLM-4.7** | 128K tokens | ~4K 输出 |

### Token 价格对比（$/百万 tokens）

| 模型 | 输入 | 输出 |
| ---- | ---- | ---- |
| **Claude Opus 4.5** | $15 | $75 |
| **Claude Sonnet 4.5** | $3 | $15 |
| **GPT-4o** | $5 | $15 |
| **GPT-5.2** | $2 | $8 |
| **Gemini 2.0 Pro** | $1.25 | $5 |
| **GLM-4.7** | ¥2.2 (≈$0.3) | ¥6.6 (≈$0.9) |

---

## Token 实用计算

### 1. 快速估算

```
英文: 字符数 ÷ 4 ≈ Token 数
中文: 字符数 ÷ 2 ≈ Token 数
代码: 行数 × 10 ≈ Token 数
```

### 2. 精确计算工具

#### Tiktoken (OpenAI)

```python
import tiktoken

# GPT-4 编码器
encoding = tiktoken.encoding_for_model("gpt-4")
text = "Hello, world!"
tokens = encoding.encode(text)
print(f"Token 数量: {len(tokens)}")
```

#### Anthropic Tokenizer

```python
import anthropic

client = anthropic.Anthropic()
response = client.messages.count_tokens(
    model="claude-3-opus-20240229",
    text="Hello, world!"
)
print(f"Token 数量: {response.input_tokens}")
```

#### 在线工具

- [Token 计算](https://platform.openai.com/tokenizer)
- [Claude Token 计数](https://calculator.anthropic.com/)

---

## Token 使用优化

### 1. 减少 Token 消耗

| 优化方法 | 效果 |
| -------- | ---- |
| **删除无用信息** | 节省 20-40% |
| **精简提示词** | 节省 30-50% |
| **使用压缩格式** | 节省 10-20% |
| **避免重复内容** | 节省 15-30% |

### 2. 系统提示词优化

```diff
- verbose: "You are a highly intelligent and capable assistant designed to help users with a wide variety of tasks..."
+ concise: "你是一个智能助手，擅长代码开发和问题解决。"
```

### 3. 上下文管理

```python
# 只包含相关文件
relevant_files = [
    "src/utils/auth.ts",    # 包含
    "src/utils/helpers.ts", # 包含
    # "src/utils/deprecated.ts", # 排除
]

# 使用摘要代替全文
file_summary = summarize_large_file("large_file.ts")  # 100 tokens
# vs 完整文件: # 5000 tokens
```

### 4. 缓存策略

| 缓存类型 | 说明 | 节省 |
| -------- | ---- | ---- |
| **系统提示缓存** | Claude/GPT 支持 | 可重用 |
| **文档缓存** | 预处理文档 | 减少重复输入 |
| **向量检索** | 只取相关片段 | 大幅减少上下文 |

---

## Token 成本计算

### 1. 成本估算示例

假设使用 GPT-4o 分析代码库：

```
代码库规模: 100,000 行代码
Token 估算: 100,000 × 10 = 1,000,000 tokens
输入成本: 1M × $5/1M = $5
输出成本: 50K × $15/1M = $0.75
总成本: ~$6
```

### 2. 不同模型成本对比

假设处理 1M tokens：

| 模型 | 输入成本 | 总成本 |
| ---- | -------- | ------ |
| **Claude Opus 4.5** | $15 | ~$90 |
| **Claude Sonnet 4.5** | $3 | ~$18 |
| **GPT-4o** | $5 | ~$30 |
| **GPT-5.2** | $2 | ~$12 |
| **Gemini 2.0 Pro** | $1.25 | ~$7.50 |
| **GLM-4.7** | ¥2.2 (≈$0.3) | ~¥15 (≈$2) |

---

## Token 常见问题

### Q1: 为什么中英文 Token 数不同？

中文使用 Unicode 编码，一个汉字可能被拆分成多个字节，因此需要更多或更少的 tokens。

### Q2: 空格和换行算 Token 吗？

是的，空格、换行、缩进等空白字符都会被计入 tokens。

### Q3: 代码注释是否计入 Token？

是的，所有发送给模型的内容都会计入，包括注释。

### Q4: 如何减少 API 成本？

- 使用更小的模型（如 Sonnet 代替 Opus）
- 优化提示词长度
- 使用缓存和向量化
- 批量处理

### Q5: Token 和字符的精确比例？

| 语言 | Token/字符 |
| ---- | ---------- |
| 英文 | ~1:4 |
| 中文 | ~1:2 |
| 代码 | ~1:3-5 |

---

## 参考资源

### 官方文档

- [OpenAI Tokenizer](https://platform.openai.com/tokenizer)
- [Anthropic Token 计数](https://calculator.anthropic.com/)
- [Google Token 计数](https://gemini.google.com/token)

### 开源工具

- [tiktoken](https://github.com/openai/tiktoken) - OpenAI 分词器
- [tokenizers](https://github.com/huggingface/tokenizers) - Hugging Face 分词器

---

**文档更新时间：2025 年 12 月**
