---
sidebar: aiSidebar
title: Context Window
description: 'As the context approaches the upper limit of the window, the model may:'
keywords:
  - AI programming
  - LLM
  - Workflow
  - context window
  - Context
  - Window
  - ai
  - basics
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - AI coding
  - Tailwind CSS 4
---

#Context Window

## Overview

**Context Window** is the maximum number of Tokens that the large language model can **memorize and process** in a single conversation. It determines how much information the model can "see" and "understand".

> **Simple understanding**: Context window = "short-term memory capacity" of the model

---

## Core concepts

### 1. Composition of context window

```
┌─────────────────────────────────────────────────────────┐
│ Context Window │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│ │ System prompts │ │Conversation history │ │ User │ │
│  │ System   │  │ History  │  │  Query   │             │
│  │ Prompt   │  │          │  │          │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│      │              │              │                   │
│      ▼              ▼              ▼                   │
│  [========|============|============]                  │
│  └───────────────────────────────────────────────────┘  │
│Total number of Tokens ≤ context window │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. Input vs output window

| Type              | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| **Input window**  | The maximum number of Tokens that the model can receive                    |
| **Output Window** | The maximum number of Tokens that the model can generate (usually < input) |

---

##Context window of mainstream model

### Very long context model (>500K)

| model              | context length | release time |
| ------------------ | -------------- | ------------ |
| **Gemini 2.0 Pro** | 2M tokens      | 2025.02      |
| **Gemini 1.5 Pro** | 1M tokens      | 2024.02      |
| **GPT-5.2**        | 1M tokens      | 2024.12      |
| **Claude 3**       | 200K tokens    | 2024.03      |

### Standard context model (100K-200K)

| model                 | context length |
| --------------------- | -------------- |
| **Claude Opus 4.5**   | 200K           |
| **Claude Sonnet 4.5** | 200K           |
| **GPT-4o**            | 128K           |
| **GLM-4.7**           | 128K           |

### Medium context model (32K-100K)

| model         | context length |
| ------------- | -------------- |
| **GPT-4**     | 32K / 8K       |
| **Claude 2**  | 100K           |
| **Llama 3.1** | 128K           |

### Small context model (<32K)

| model               | context length |
| ------------------- | -------------- |
| **GPT-3.5**         | 16K / 4K       |
| **Original Claude** | 9K / 72K       |
| **Llama 2**         | 4K             |

---

## Evolution of context window

```
2020 ────── 2022 ────── 2024 ────── 2026
 │           │           │           │
2048    →   32K    →   128K   →   2M
 (GPT-3)     (GPT-4)     (GPT-4 Turbo)  (Gemini)
```

**Key Milestones**:

| time    | model      | window size | meaning                       |
| ------- | ---------- | ----------- | ----------------------------- |
| 2020.06 | GPT-3      | 2K          | First large-scale application |
| 2023.03 | GPT-4      | 32K         | Long text processing          |
| 2023.07 | Claude 2   | 100K        | Extra long context            |
| 2024.02 | Gemini 1.5 | 1M          | Million level breakthrough    |
| 2025.02 | Gemini 2.0 | 2M          | Current largest               |

---

## The role of the context window

### 1. Code analysis

```
Project size Required window Recommended model
────────────────────────────────────
Single file 1K any
Small projects 50K-100K Claude, GPT-4
Medium-sized projects 200K-500K Gemini 1.5
Large Projects 1M+ Gemini 2.0 Pro
Full library analysis 2M+ Gemini 2.0 Pro (needs to be divided into blocks)
```

### 2. Document processing

| Document Type   | Length          | Required Model       |
| --------------- | --------------- | -------------------- |
| Short article   | <5K tokens      | Any                  |
| Long article    | 20-50K tokens   | Claude 3, GPT-4      |
| Books           | 100-500K tokens | Gemini 1.5, Claude 3 |
| Legal Documents | 500K-1M tokens  | Gemini 2.0 Pro       |

### 3. Multiple rounds of dialogue

```
Number of dialogue rounds Average tokens/round Total tokens Model required
────────────────────────────────────────
10 rounds 500 5K any
50 rounds 500 25K Claude, GPT-4
100 rounds 500 50K Claude 3
500 rounds 500 250K Gemini 1.5+
```

---

## Context management technology

### 1. Sliding window

```
Original context: [A][B][C][D][E][F][G][H][I][J]
Window size: 4

Step 1: [A][B][C][D]
Step 2: [B][C][D][E]
Step 3: [C][D][E][F]
Step 4: [D][E][F][G]
...
```

### 2. Importance sampling

```
Full context: [A][B][C][D][E][F][G][H][I][J]
Importance: ↑ ↑ ↑ ↑
Reserved: [A][C][E][G][I]
```

### 3. Block processing

```
Large document: [==== ==== ==== ==== ==== ====]
                      ↓
Blocking: [Block 1][Block 2][Block 3][Block 4][Block 5][Block 6]
                      ↓
Summary: [Abstract 1][Abstract 2][Abstract 3][Abstract 4][Abstract 5][Abstract 6]
                      ↓
Final: [Comprehensive summary]
```

### 4. Vector retrieval (RAG)

```
User question → Vectorize → Retrieve relevant fragments → Add to context
                            ↓
[System Prompt] + [Retrieve Fragments] + [User Question]
                            ↓
model answer
```

---

## Super long context technology

### 1. Attention mechanism optimization

**Core question**: The complexity of traditional attention is O(n²)

| Technology           | Complexity | Description             |
| -------------------- | ---------- | ----------------------- |
| **Flash Attention**  | O(n²)      | Optimize memory access  |
| **Ring Attention**   | O(n²)      | Block-level calculation |
| **Linear Attention** | O(n)       | Linear approximation    |

### 2. Position encoding

| Technology                     | Maximum length | Description        |
| ------------------------------ | -------------- | ------------------ |
| **Absolute position encoding** | 2048           | GPT-3 used         |
| **Relative position encoding** | 8192           | T5 use             |
| **RoPE (Rotation Position)**   | ∞              | LLaMA, Gemini used |
| **ALiBi**                      | ∞              | BLOOM use          |

### 3. KV Cache compression

```
Original KV Cache: [==== ==== ==== ==== ====] (takes up a lot of memory)
After compression: [== == == == ==] (key information retained)
```

---

## Best practices for context windows

### 1. Choose the appropriate model

| Scene                  | Recommended model         | Window size |
| ---------------------- | ------------------------- | ----------- |
| Simple conversation    | GPT-4o-mini, Claude Haiku | 128K        |
| Code Review            | Claude Opus 4.5           | 200K        |
| Full database analysis | Gemini 2.0 Pro            | 2M          |
| Documentation Q&A      | Gemini 1.5 Pro            | 1M          |

### 2. Optimize context usage

```diff
- Contains entire file history
+ Only include the currently modified part

- Send the same message repeatedly
+ Use references or caches

- lengthy system prompts
+ Concise and effective prompt words
```

### 3. Monitor Token usage

```python
import anthropic

client = anthropic.Anthropic()

# Check Token usage
response = client.messages.count_tokens(
    model="claude-3-opus-20240229",
text="Your content..."
)

print(f"Input Token: {response.input_tokens}")
print(f"Window usage: {response.input_tokens / 200000 * 100:.1f}%")
```

---

## Limitations of the context window

### 1. Decline in quality

As the context approaches the upper limit of the window, the model may:

- Forgetting earlier information
- Decline in answer quality
- Hallucinations

### 2. Cost increase

```
Token quantity ∝ API cost
```

### 3. Increased latency

```
context length → inference time
10K tokens → ~2 seconds
100K tokens → ~10 seconds
1M tokens → ~60 seconds+
```

---

## Reference resources

### paper

- [Transformer-XL](https://arxiv.org/abs/1901.02860) - Extra long context Transformer
- [Ring Attention](https://arxiv.org/abs/2310.01889) - block level attention
- [MegaByte](https://arxiv.org/abs/2310.05414) - Million level context

### Technology Blog

- [Anthropic Context Window](https://www.anthropic.com/index/context-window)
- [Google Gemini 1.5](https://blog.google/technology/ai/google-gemini-next-generation-model-february-2025/)

---

**Document updated: December 2025**
