---
sidebar: aiSidebar
title: Token (word element)
description: 'Token (word element): Current concepts, configuration guidance, and practical examples for weapp-tailwindcss users.'
keywords:
  - AI programming
  - LLM
  - Workflow
  - Token
  - word element
  - ai
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# Token (word element)

## Overview

**Token** is the **basic unit** for large language models (LLM) to process text. Different from "words" or "characters" understood by humans, Token is the smallest semantic unit used internally in the model.

> **Core concept**: 1 Token ≈ 0.75 English words ≈ 4 characters ≈ 2-3 Chinese characters

---

## The essence of Token

### 1. What is Token?

Token is a **sequence fragment** that cuts the text into:

```
Enter text: "Hello, world!"
Token sequence: ["Hello", ",", "world", "!"]
Number of tokens: 4
```

### 2. Tokenization

The process of converting text into Token sequence:

```python
# GPT word segmentation example
text = "Artificial Intelligence is amazing"
tokens = ["Art", "ificial", " Int", "elligence", " is", " am", "azing"]
# 7 tokens

# Claude word segmentation example
text = "Artificial Intelligence is amazing"
tokens = ["Art", "ificial", " Intelligence", " is", " amazing"]
# 5 tokens (different models have different word segmentations)
```

### 3. Byte Pair Encoding (BPE)

Mainstream Tokenization methods:

```
Original: "unbelievable"
Step 1: u n b e l i e v a b l e (character level)
Step 2: un bel ieve able (word level + character level mixture)
Step 3: ["un", "believable"] (final Token)
```

---

## Token counting rules

### 1. English text

| Text type                   | Token estimate |
| --------------------------- | -------------- |
| 1 word                      | ~1.3 tokens    |
| 1 sentence (15 words)       | ~20 tokens     |
| 1 paragraph (100 words)     | ~130 tokens    |
| 1 page document (500 words) | ~650 tokens    |

### 2. Chinese text

| Text type               | Token estimate |
| ----------------------- | -------------- |
| 1 Chinese character     | ~0.5-1 token   |
| 1 word (2-3 characters) | ~1-2 tokens    |
| 1 sentence (20 words)   | ~10-15 tokens  |
| 1 paragraph (100 words) | ~50-70 tokens  |

### 3. Code

| Code Type              | Token Estimate    |
| ---------------------- | ----------------- |
| 1 line of simple code  | ~10-20 tokens     |
| 1 line of complex code | ~30-50 tokens     |
| 1 function (50 lines)  | ~300-500 tokens   |
| 1 file (500 lines)     | ~3000-5000 tokens |

### 4. Special scenes

| Scenario          | Token Count   |
| ----------------- | ------------- |
| space             | 1 token       |
| newline           | 1 token       |
| indent (2 spaces) | 1 token       |
| tab               | 1 token       |
| Number (12345)    | 1-2 tokens    |
| URL               | ~10-20 tokens |

---

## Token restrictions for each model

### Context Window

| Model                 | Context Length | Output Limits |
| --------------------- | -------------- | ------------- |
| **Claude Opus 4.5**   | 200K tokens    | ~8K outputs   |
| **Claude Sonnet 4.5** | 200K tokens    | ~8K outputs   |
| **GPT-4o**            | 128K tokens    | ~4K outputs   |
| **GPT-5.2**           | 1M tokens      | ~8K outputs   |
| **Gemini 2.0 Pro**    | 2M tokens      | ~8K outputs   |
| **Gemini 1.5 Pro**    | 1M tokens      | ~8K outputs   |
| **GLM-4.7**           | 128K tokens    | ~4K outputs   |

### Token price comparison ($/million tokens)

| Model                 | Input        | Output       |
| --------------------- | ------------ | ------------ |
| **Claude Opus 4.5**   | $15          | $75          |
| **Claude Sonnet 4.5** | $3           | $15          |
| **GPT-4o**            | $5           | $15          |
| **GPT-5.2**           | $2           | $8           |
| **Gemini 2.0 Pro**    | $1.25        | $5           |
| **GLM-4.7**           | ¥2.2 (≈$0.3) | ¥6.6 (≈$0.9) |

---

## Token practical calculation

### 1. Quick estimate

```
English: Number of characters ÷ 4 ≈ Number of Tokens
Chinese: Number of characters ÷ 2 ≈ Number of Tokens
Code: Number of lines × 10 ≈ Number of Tokens
```

### 2. Accurate calculation tools

#### Tiktoken (OpenAI)

```python
import tiktoken

# GPT-4 encoder
encoding = tiktoken.encoding_for_model("gpt-4")
text = "Hello, world!"
tokens = encoding.encode(text)
print(f"Token quantity: {len(tokens)}")
```

#### Anthropic Tokenizer

```python
import anthropic

client = anthropic.Anthropic()
response = client.messages.count_tokens(
    model="claude-3-opus-20240229",
    text="Hello, world!"
)
print(f"Token quantity: {response.input_tokens}")
```

#### Online tools

- [Token calculation](https://platform.openai.com/tokenizer)
- [Claude Token Count](https://calculator.anthropic.com/)

---

## Token usage optimization

### 1. Reduce Token consumption

| Optimization method            | Effect      |
| ------------------------------ | ----------- |
| **Delete useless information** | Save 20-40% |
| **Simplified Prompt Words**    | Save 30-50% |
| **Use compressed format**      | Save 10-20% |
| **Avoid Duplicate Content**    | Save 15-30% |

### 2. System prompt word optimization

```diff
- verbose: "You are a highly intelligent and capable assistant designed to help users with a wide variety of tasks..."
+ concise: "You are an intelligent assistant who is good at code development and problem solving."
```

### 3. Context management

```python
# Include only relevant files
relevant_files = [
"src/utils/auth.ts", # contains
"src/utils/helpers.ts", # contains
# "src/utils/deprecated.ts", # exclude
]

# Use abstract instead of full text
file_summary = summarize_large_file("large_file.ts")  # 100 tokens
# vs full file: # 5000 tokens
```

### 4. Caching strategy

| Cache Type              | Description                   | Savings                      |
| ----------------------- | ----------------------------- | ---------------------------- |
| **System prompt cache** | Claude/GPT support            | Reusable                     |
| **Document Caching**    | Preprocessing documents       | Reduce repeated input        |
| **Vector retrieval**    | Fetch only relevant fragments | Significantly reduce context |

---

## Token cost calculation

### 1. Cost Estimation Example

Assume using GPT-4o to analyze the code base:

```
Code base size: 100,000 lines of code
Token estimate: 100,000 × 10 = 1,000,000 tokens
Input cost: 1M × $5/1M = $5
Output cost: 50K × $15/1M = $0.75
Total cost: ~$6
```

### 2. Cost comparison of different models

Assume processing 1M tokens:

| Model                 | Input Cost   | Total Cost |
| --------------------- | ------------ | ---------- |
| **Claude Opus 4.5**   | $15          | ~$90       |
| **Claude Sonnet 4.5** | $3           | ~$18       |
| **GPT-4o**            | $5           | ~$30       |
| **GPT-5.2**           | $2           | ~$12       |
| **Gemini 2.0 Pro**    | $1.25        | ~$7.50     |
| **GLM-4.7**           | ¥2.2 (≈$0.3) | ~¥15 (≈$2) |

---

## Token FAQ

### Q1: Why are the numbers of Tokens different in Chinese and English?

Chinese uses Unicode encoding, and a Chinese character may be split into multiple bytes, so more or fewer tokens are needed.

### Q2: Do spaces and line breaks count as tokens?

Yes, whitespace characters such as spaces, newlines, indents, etc. will be counted in tokens.

### Q3: Are code comments included in Tokens?

Yes, everything sent to the model is counted, including comments.

### Q4: How to reduce API costs?

- Use smaller models (like Sonnet instead of Opus)
- Optimize prompt word length
- Use caching and vectorization
- Batch processing

### Q5: What is the exact ratio between Token and characters?

| Language | Token/Character |
| -------- | --------------- |
| English  | ~1:4            |
| Chinese  | ~1:2            |
| Code     | ~1:3-5          |

---

## Reference resources

### Official Documentation

- [OpenAI Tokenizer](https://platform.openai.com/tokenizer)
- [Anthropic Token Count](https://calculator.anthropic.com/)
- [Google Token Count](https://gemini.google.com/token)

### Open source tools

- [tiktoken](https://github.com/openai/tiktoken) - OpenAI tokenizer
- [tokenizers](https://github.com/huggingface/tokenizers) - Hugging Face tokenizer

---

**Document updated: December 2025**
