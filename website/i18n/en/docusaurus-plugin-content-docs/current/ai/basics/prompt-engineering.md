---
sidebar: aiSidebar
title: Prompt Engineering
description: 'Prompt Engineering: Current concepts, configuration guidance, and practical examples for weapp-tailwindcss users.'
keywords:
  - AI programming
  - LLM
  - Workflow
  - Prompt
  - Engineering
  - prompt word project
  - ai
  - basics
  - prompt engineering
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
---

# Prompt Engineering

## Overview

**Prompt** is the **instruction or question** that the user inputs to the large language model. **Prompt Engineering** is the technology of designing and optimizing prompt words to obtain better output results.

> **Core Principle**: Good prompt words = clear, specific, and structured

---

## What is a prompt word?

### 1. Basic definition

**Prompt words** are text inputs for interacting with the AI:

```
User input: "Write a quick sort algorithm for me"
          ↑
This is Prompt
```

### 2. Components of prompt words

```
┌─────────────────────────────────────────────────────────┐
│ Prompt word structure │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│ │ Role/Identity Setting │ │
│ │ "You are a senior front-end engineer..." │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Task Description │ │
│ │ "Help me implement a login form..." │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Context/Background Information │ │
│ │ "Using React + TypeScript..." │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Constraints/Requirements │ │
│ │ "Use the shadcn/ui component and follow the following specifications..." │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Output format │ │
│ │ "Output in Markdown format, including code blocks..." │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Example/Reference │ │
│ │ "Refer to the following code style..." │ │
│  └──────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Good prompt word principles

### CREATE framework

| Principles   | Description        | Examples                                          |
| ------------ | ------------------ | ------------------------------------------------- |
| **C**lear    | Clear and clear    | "Write a bubble sort in Python"                   |
| **R**ole     | Set role           | "You are a senior front-end engineer"             |
| **E**xact    | Exact and specific | "Generate 10 random integers, ranging from 1-100" |
| **A**udience | Clear Audience     | "Explaining the concept of closures to beginners" |
| **T**one     | Set the tone       | "Use a professional but friendly tone"            |
| **E**xample  | Provide examples   | "Refer to the following code style"               |

---

## Good prompt words vs bad prompt words

### Example 1: Code generation

#### ❌ Bad prompt words

```
Write a login function
```

**question**:

- No technology stack specified
- No requirement details stated
- No input and output defined

#### ✅ Good reminder words

```
You are a senior front-end engineer. Please help me create a React + TypeScript login form component:

need:
1. Contains email and password input boxes
2. Use shadcn/ui component library
3. Support form verification (email format, password at least 8 characters)
4. Include a "Remember Me" checkbox
5. The login button displays the Loading status when loading
6. Define types using TypeScript

Please provide complete component code and type definitions.
```

---

### Example 2: Bug fix

#### ❌ Bad prompt words

```
There is something wrong with this code, please help me check it
```

**question**:

- No specific problem stated
- No error message provided
- No description of expected behavior

#### ✅ Good reminder words

````
There is a problem with my React component and I need your help troubleshooting:

Problem description:
After clicking the "Submit" button, the form was not submitted and there was no prompt.

Code:
```tsx
function SubmitForm() {
  const handleSubmit = () => {
    console.log('Form submitted')
  }

return <button onClick={handleSubmit}>submit</button>
}
````

Expected behavior:
After clicking the button, a "Submit Successfully" prompt should be displayed.

Please analyze the problem and provide the corrected code.

```

---

### Example 3: Code Refactoring

#### ❌ Bad prompt words

```

Optimize this code

```

**question**:
- No optimization goals stated
- No constraints stated
- No priority stated

#### ✅ Good reminder words

```

Please help me optimize the following code with the goal of improving readability and performance:

Code:

```typescript
const getUserData = async (id: string) => {
  const user = await fetchUser(id)
  const posts = await fetchPosts(user.id)
  const comments = await fetchComments(posts.map(p => p.id))
  return { user, posts, comments }
}
```

Optimization requirements:

1. Reduce unnecessary waiting (parallel processing)
2. Add error handling
3. Add TypeScript types
4. Keep function naming clear

Please provide optimized code and modification instructions.

```

---

### Example 4: Documentation

#### ❌ Bad prompt words

```

Help me write a document

```

#### ✅ Good reminder words

```

Please write API documentation for the following functions:

function:

```typescript
async function createUser(data: {
  email: string
  password: string
  name: string
}): Promise<{id: string; email: string}>
```

Document format:

- Function description
- Parameter description (type, whether required)
- Return value description
- Usage examples
- Errors that may be thrown

Use Markdown format for output.

```

---

### Example 5: Code review

#### ❌ Bad prompt words

```

Review this code

```

#### ✅ Good reminder words

```

As a code review expert, please review the following React components:

Review focus:

1. Type safety
2. Performance issues (unnecessary re-rendering)
3. Error handling
4. Code readability
5. Best practice compliance

Code:

```tsx
import { useState, useEffect } from 'react'

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState(null)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetchUser(userId).then(setUser)
    fetchUserPosts(userId).then(setPosts)
  }, [userId])

  if (!user) return <div>Loading...</div>

  return (
    <div>
      <h1>{user.name}</h1>
      <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
    </div>
  )
}
```

Please output in list form:

- Issues found
- Severity (high/medium/low)
- Fix suggestions

```

---

## Advanced prompt word skills

### 1. Few-Shot Prompting

Provide examples to help the AI  understand expectations:

```

Please convert the following natural language into SQL query statements.

Example 1:
Input: Find all users with the last name Zhang
Output: SELECT * FROM users WHERE name LIKE 'open%'

Example 2:
Input: Find users older than 25
Output: SELECT * FROM users WHERE age > 25

Example 3:
Input: Find users registered this year
Output: SELECT * FROM users WHERE YEAR(created_at) = YEAR(CURDATE())

Please convert now:
Input: Find all users whose status is "active" and whose registration time is after 2024
Output:

```

### 2. Chain of Thought (Thought Chain)

Guide the AI  to demonstrate the reasoning process:

```

Please use step-by-step reasoning to solve the following questions:

Question: If the first three terms of a sequence are 2, 6, 18, find the fourth term.

Reasoning process:

1. Observe the relationship between two adjacent items
2. Calculate proportional relationships
3. Verify the rules
4. Apply rules to solve problems

Please follow the steps above to reason step by step and give your answer.

```

### 3. Character setting

```

You are a front-end engineer with 10 years of experience, specializing in React and TypeScript.
You are familiar with various design patterns and best practices.
Your answer should be professional, accurate, and include practical code examples.

```

### 4. Structured output

```

Please output in the following format:

## Problem description

[Brief description of the problem]

## root cause

[Root cause analysis]

## Solution

### Option 1

[Program description]
advantage:...
shortcoming:...

### Option 2

[Program description]
advantage:...
shortcoming:...

## recommend

[Recommended plan and reasons]

## Code Example

```typescript
[code]
```

```

### 5. Constraints and Boundaries

```

Please generate a random password generation function.

Constraints:

- Password length: 16-32 characters (configurable)
- Must contain: uppercase letters, lowercase letters, numbers, special characters
- Cannot contain confusing characters (such as l, 1, O, 0)
- Implemented using TypeScript

Please do not use any external libraries.

```

---

## Common prompt word templates

### Code generation template

```

You are an {language/framework} expert.

Please help me implement the following functions:
{Function description}

Technical requirements:

- Frame: {frame name}
- Language: {programming language}
- Style: {CSS scheme}
- Status management: {status scheme}

Functional requirements:
{Detailed requirements list}

Please provide:

1. Complete code implementation
2. Necessary explanatory notes
3. Usage examples

Code style:
{Style Requirements}

```

### Bug fix template

```

I have encountered a problem and need your help to solve it:

**Problem description**
{problem description}

**error message**

```
{Error log}
```

**Related Code**

```{language}
{code}
```

**Environmental Information**

- Frame: {frame and version}
- Operating environment: {Browser/Node version}
- Build tool: {webpack/vite, etc.}

**tried solutions**
{tried solutions}

Please analyze the cause of the problem and provide a fix.

```

### Code review template

```

Please review the following code:

**Review Highlights**
{Review Highlights List}

**Code**

```{language}
{code}
```

**Context**
{Relevant background information}

Please output:

1. Issues found
2. Risk assessment
3. Improvement suggestions

```

### Refactoring suggestion template

```

Please analyze the following code and provide refactoring suggestions:

```{language}
{code}
```

Refactoring goals:
{Goals: such as improving performance, improving readability, reducing complexity}

Constraints:
{Constraints: such as keeping the API unchanged and not introducing new dependencies}

Please provide:

1. Problem analysis of current code
2. Refactored code
3. Change description

```

---

## Prompt word anti-pattern

### ❌ Patterns to avoid

| Anti-Patterns | Issues | Improvements |
| ------ | ---- | ---- |
| **Fuzzy command** | "Help me optimize" | "Optimize performance and reduce response time by 50%" |
| **Too much information** | Long background description | Extract key information |
| **Conflicting requirements** | "Simple but full-featured" | Clear priorities |
| **Missing context** | "How to change this function" | Provide complete code and purpose |
| **Assumptions** | "You should know..." | Make all information clear |

### ✅ Good pattern

| Mode | Description |
| ---- | ---- |
| **Clear Goals** | Clearly state what you want |
| **Provide context** | Give necessary background information |
| **Clear Structure** | Use Sections and Lists |
| **Specific Constraints** | Clear limitations and requirements |
| **Example Guide** | Use examples to illustrate expectations |

---

## Prompt words for different scenarios

### 1. Front-end development

```

Please create a React + TypeScript user list component:

need:

- Use TypeScript to define User type: { id, name, email, avatar }
- Use the Table component of shadcn/ui to display the user list
- Support paging (10 items per page)
- Support search by name
- Click on a row to view user details

API interface: GET /api/users?page=1&limit=10&search=keyword
Return format: { data: User[], total: number }

Please provide complete component code and necessary type definitions.

```

### 2. Back-end development

```

Please use Node.js + Express to create a user authentication API:

need:

- POST /api/auth/register - User registration
- POST /api/auth/login - user login
- POST /api/auth/logout - user logs out
- GET /api/auth/me - Get current user information

Technical requirements:

- Use TypeScript
- Using Prisma ORM
- Use JWT for authentication
- Passwords are encrypted using bcrypt
- Database uses PostgreSQL

Data model (User):

- id: UUID
- email: unique
- password: encrypted storage
- name: username
- createdAt: creation time

Please provide complete route, controller and middleware code.

```

### 3. Data analysis

```

Please help me analyze the following data:

Sales data:

```
Month, Q1, Q2, Q3, Q4
Product A,120,150,180,200
Product B,80,90,100,110
Product C,200,180,150,120
```

Please provide:

1. Quarterly growth trend analysis
2. Product performance comparison
3. Potential problem identification
4. Improvement suggestions

Output in Markdown format and includes data visualization suggestions.

```

### 4. Document generation

```

Please generate Swagger/OpenAPI documentation for the following APIs:

API endpoint: POST /api/users

Request body:
{
"email": "string (required, email format)",
"password": "string (required, minLength: 8)",
"name": "string (required)"
}

Successful response (201):
{
"id": "uuid",
"email": "string",
"name": "string",
"createdAt": "datetime"
}

Error response:

- 400: Parameter verification failed
- 409: Email already exists

Please generate the complete OpenAPI 3.0 specification (YAML format).

```

---

## Prompt word iteration optimization

### Iterative process

```

First Edition (Basic Edition)
"Write a login function"
↓
❌ The results are not as expected
↓
Second version (added details)
"Write a login form using React, including email and password"
↓
⚠️ Close, but not perfect yet
↓
Third edition (refined)
"Please create a React + TypeScript login form using shadcn/ui..."
↓
✅Satisfied

```

### Iteration techniques

1. **Start Simple**: Give the basic version first
2. **Add details step by step**: Add one requirement at a time
3. **Observe Output**: Analyze the parts that do not meet expectations
4. **Targeted Correction**: Point out specific issues
5. **Verification results**: Confirm whether the requirements are met

---

## Reference resources

### Official Documentation

- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Anthropic Prompt Library](https://docs.anthropic.com/prompt-library)
- [Google Prompting Guide](https://ai.google.dev/gemini-api/prompting-strategies)

### Learning resources

- [Learn Prompting](https://learnprompting.org/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)

### Community Resources

- [Awesome Prompt Engineering](https://github.com/f/awesome-prompt-engineering)
- [Prompt Examples](https://github.com/matthew-burrell/prompt-examples)

---

**Document updated: December 2025**
```
