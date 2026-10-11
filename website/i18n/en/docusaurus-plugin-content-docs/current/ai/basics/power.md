---
sidebar: aiSidebar
title: Power (standard-driven programming)
description: >-
  Power (standard-driven programming): Current concepts, configuration guidance, and practical examples for
  weapp-tailwindcss users.
keywords:
  - AI programming
  - LLM
  - Workflow
  - Power
  - Specification driven programming
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

# Power (standard-driven programming capabilities)

## Overview

**Power** is a concept proposed by **Kiro** to measure the ability of **AI tools to understand complex specifications and generate code that conforms to the specifications**. In the context of Spec-Driven Development, Power refers to the ability of AI to convert unstructured requirements descriptions into structured technical specifications and ultimately generate executable code.

> **Core concept**: Power = specification understanding ability × code generation ability × constraint compliance ability

---

## Definition of Power

### 1. Basic concepts

**Power** is the core capability indicator of AI programming tools:

```
┌─────────────────────────────────────────────────────────┐
│ The composition of Power │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────┐      │
│ │Spec Understanding (Spec Understanding) │ │
│ │ Understand natural language requirements → Structured specifications │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │Spec Generation │ │
│ │ Generate API, data model, and UI specifications │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Code Implementation │ │
│ │ Generate code that meets the requirements according to specifications │ │
│  └──────────────────────────────────────────────┘      │
│                         ↓                               │
│  ┌──────────────────────────────────────────────┐      │
│ │ Constraint Adherence │ │
│ │ Follow coding standards, technical constraints, and business rules │ │
│  └──────────────────────────────────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2. Dimensions of Power

| Dimensions        | Description                                       | Evaluation Criteria                                      |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------- |
| **Understanding** | Ability to understand complex requirements        | Ability to accurately extract key information            |
| **Structured**    | The ability to generate structured specifications | Whether the specifications are complete and consistent   |
| **Achievability** | The ability to generate executable code           | Whether the code is available and correct                |
| **Compliance**    | Ability to follow constraints                     | Whether compliance with specification requirements       |
| **Consistency**   | Stability of multiple outputs                     | Whether similar results are obtained with the same input |

---

## Level of Power

### Level 0: No standard ability

```
feature:
- Unable to understand structured requirements
- Can only handle simple commands
- Generating code requires a lot of manual modification

Example:
Input: "Write a login"
Output: [Basic code, but missing types, validation, error handling]
```

### Level 1: Basic specification understanding

```
feature:
- Ability to understand simple structured requirements
- Able to generate basic code framework
- Need to manually add details

Example:
Input: "Use React + TypeScript to write login, including email and password"
Output: [Typed component, but may be missing validation logic]
```

### Level 2: Intermediate normative ability

```
feature:
- Ability to understand multi-level specifications
- Ability to generate complete API specifications
- The code is basically usable, with minor adjustments required

Example:
Input: "User login function, requires verification, error handling, JWT"
Output: [Complete login process, including front and back ends]
```

### Level 3: Advanced specification capabilities

```
feature:
- Ability to understand complex business specifications
- Able to generate front-end and back-end joint debugging code
- Contains tests and documentation

Example:
Input: "Complete user authentication system (registration, login, logout, permissions)"
Output: [Full stack code + API documentation + test cases]
```

### Level 4: Expert level specification ability

```
feature:
- Ability to understand enterprise-level specifications
- Automatically handle edge cases and exceptions
- Generate production-grade code

Example:
Input: "E-commerce order system (including payment, inventory, logistics, refund)"
Output: [microservice architecture + database design + complete implementation]
```

---

## Power’s assessment

### 1. Evaluation dimensions

```markdown
## Power Evaluation Card

### Requirements understanding
- [ ] can identify core functions
- [ ] Ability to identify non-functional requirements (performance, security)
- [ ] Able to identify dependencies and constraints
- [ ] can identify boundary conditions

### Specification generation
- [ ] API specification completeness
- [ ] Data model rationality
- [ ] Error handling override
- [ ] Verify that the rules are complete

### Code quality
- [ ] Grammatical correctness
- [ ] type safety
- [ ] Code readability
- [ ] Best practices to follow

### Constraint compliance
- [ ] Technology stack constraints
- [ ] Coding specification constraints
- [ ] Business rule constraints
- [ ] Performance constraints
```

### 2. Scoring Criteria

| Score      | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| **0-20**   | Almost impossible to understand the specification                         |
| **20-40**  | Able to understand simple specifications, code needs to be modified a lot |
| **40-60**  | Can understand medium specifications, the code needs minor modifications  |
| **60-80**  | Can understand complex specifications and the code is basically usable    |
| **80-100** | Fully understand the specification and generate production-grade code     |

### 3. Automated assessment

```python
# Power evaluation script example
def evaluate_power(ai_tool, test_cases):
    scores = []
    for case in test_cases:
# Generate specification
        spec = ai_tool.generate_spec(case.requirement)

# Generate code
        code = ai_tool.generate_code(spec)

# Evaluate
        score = {
            "spec_completeness": check_spec_completeness(spec, case),
            "code_correctness": check_code_correctness(code),
            "constraint_adherence": check_constraints(code, case.constraints),
            "test_pass_rate": run_tests(code, case.tests)
        }

        scores.append(score)

    return aggregate_scores(scores)
```

---

## How Power is reflected in different tools

### 1. Cursor Composer

**Composer** features of Cursor:

```
Features:
├── Automatically plan task steps
├──Cross-file code generation
├── Contextual awareness
└── Iterative optimization

Power Level: Level 2-3
```

### 2. Claude Code

Claude Code’s **Plan Mode**:

```
Features:
├── Deep code understanding
├── Step-by-step implementation plan
├── Manual confirmation mechanism
└── Detailed description

Power level: Level 3
```

### 3. GitHub Copilot Workspace

Copilot’s **Workspace**:

```
Features:
├── Issue → Spec → Code process
├── Test generation
├── Pull Request Description
└── Iterative improvement

Power Level: Level 2-3
```

---

## Tips for improving Power

### 1. Write better specifications

#### Use structured format

```markdown
# ❌ Vague specifications
"Make a user management function"

# ✅ Structured specifications
## Function: User management

### need
- User list (paging, search)
- User details
- Create user
- Edit user
- Delete user (soft delete)

### Field definition
- id: UUID
- name: string, 2-50 characters
- email: email format, unique
- role: enumeration (admin, user, guest)
- status: enumeration (active, inactive)
- created_at: timestamp

### Validation rules
- name required
- email only
- role defaults to user

### API Design
GET /api/users # list
GET /api/users/:id #Details
POST /api/users # Create
PUT /api/users/:id # Update
DELETE /api/users/:id # Delete

### Technical requirements
- React + TypeScript
- RESTful API
- Using Prisma ORM
```

### 2. Use templates

```markdown
# Functional specification template

## Function Overview
[one sentence description]

## User Stories
As [role], I want [feature] for [purpose]

## Acceptance criteria
- [ ] Standard 1
- [ ] Standard 2

## Technical specifications
### Data model
### API interface
### UI specifications

## Non-functional requirements
### Performance
### Safety
### compatibility
```

### 3. Progressive specification

```
First version (rough):
"User login function"

Second version (added details):
"User login, email and password need to be verified"

Third Edition (Complete Specification):
[Full functional specification with all details]

Version 4 (iterative optimization):
[Optimized version based on feedback]
```

### 4. Provide examples

```
# Add example to specification

## Input example
{
  "email": "user@example.com",
  "password": "SecurePass123"
}

## Output example
Success (200):
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {...}
}

Failure (401):
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

## Limitations of Power

### 1. Complex business logic

```
Problem: AI has trouble understanding complex business rules

solve:
- Decomposed into multiple small functions
- Provide detailed rules description
- Add decision tree/flow chart
```

### 2. Tacit knowledge

```
Problem: AI cannot access the team’s tacit knowledge

solve:
- Use llms.txt/CLAUDE.md
- Maintain project specification documents
- Create a library of code examples
```

### 3. Contextual restrictions

```
Problem: Large project specification exceeds context window

solve:
- Module writing specifications
- Use RAG to retrieve related specifications
- Establish a hierarchy of specifications
```

---

## Power and Spec-Driven Development

### relation

```
┌─────────────────────────────────────────────────────────┐
│The role of power in SDD │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Spec-Driven Development Process: │
│                                                         │
│ 1. Requirements → Specifications │
│ └── Power determines conversion quality │
│                                                         │
│ 2. Specification → Code (Spec → Code) │
│ └── Power determines code quality │
│                                                         │
│ 3. Code → Test (Code → Test) │
│ └── Power affects test coverage │
│                                                         │
│ Conclusion: The higher the Power, the higher the SDD efficiency │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Best Practices

1. **High Power Tools + Complete Specifications** = Best Results
2. **Low Power Tools + Simple Specifications** = Basic Automation
3. **High Power Tools + Simple Specifications** = Over-engineering
4. **Low Power Tools + Complex Specifications** = Limited Effectiveness

---

## Development Trend of Power

### Current status (2025)

```
Level 1-2: Mainstream
- Most AI coding tools are at this level
- Suitable for simple to medium complexity tasks

Level 3: Advanced
- Few tools reach
- Requires good specification writing

Level 4: Explore
- research phase
- Need stronger models and better tool support
```

### Future Directions

```
┌─────────────────────────────────────────────────────────┐
│The future of Power│
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Short term (1-2 years) │
│ ├── Better understanding of norms │
│ ├── More accurate code generation │
│ └── Stronger constraint compliance │
│                                                         │
│ Medium term (2-3 years) │
│ ├── Automated specification generation │
│ ├── Standard version management │
│ └── Team collaboration support │
│                                                         │
│ Long term (3-5 years) │
│ ├── Self-evolving specifications │
│ ├── Cross-project specification reuse │
│ └── Regulate market/exchange │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Reference resources

### Related documents

- [Spec-Driven Development](./spec-driven-development)
- [Vibe Coding](./vibe-coding)
- [Prompt Engineering](./prompt-engineering)

### tool

- [Cursor](https://cursor.sh) - Composer function
- [Claude Code](https://claude.ai/code) - Plan Mode

---

**Document updated: December 2025**
