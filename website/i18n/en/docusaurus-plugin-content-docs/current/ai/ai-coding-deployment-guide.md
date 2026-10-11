---
sidebar: aiSidebar
title: AI programming assistant implementation plan
description: >-
  AI programming assistant implementation plan: Current concepts, configuration guidance, and practical examples for
  weapp-tailwindcss users.
keywords:
  - AI programming
  - LLM
  - Workflow
  - AI
  - Programming Assistant Implementation Plan
  - ai coding deployment guide
  - weapp-tailwindcss
  - tailwindcss
  - Mini program
  - WeChat applet
  - uni-app
  - taro
  - mpx
---

# AI programming assistant implementation plan

> You will get: a set of implementation methods that can be decided, piloted, and copied (manageable, cost-controllable, downgradeable, and rollable). \
> Update time: 2025-12-29. Pricing instructions: RMB conversion is based on 1 USD = ¥7.2; prices and quotas may be adjusted at any time; refer to the supplier's official website and actual bill.

:::tip How to read this document (don’t read it from the beginning)

- Just want to make a quick decision: first read "0 page conclusion" → "5 agent design" → "11 execution list".
- To implement the pilot: first look at "6 Roadmap" → "7 Warehouse Access" → "8 Daily SOP" → "9 Network/Account/Compliance".
- Head of R&D: 0/5/6/11
- Platform and Tools Team: 6/7/8/9
- Security Compliance: 2/7/9
- Procurement and Finance: 4/5/11
  :::

:::note Remember three sentences first (all the details below will explain these three sentences)

1. When compliance is unclear, the default is to use domestic products to run the process through.
2. Whether the overseas experience is good or not depends 80% on whether the network and agent are consistent in "IDE + CLI + login".
3. Whether costs can be controlled depends on "agent stratification + budget cap + peaking and downgrading", not conscious awareness.
   :::

---

## 0. One-page conclusion (make decisions first, then compare)

### 0.1 Decision-making shortest path (it is recommended to make decisions in this order)

1. **Compliance Boundary**: Which warehouses/documents are allowed to leave the country? Is audit trail necessary? (Decide whether it can be used overseas and to what extent it can be used)
2. **Network capabilities**: Can you provide "IDE + CLI + login" with the same policy agent, and have backup exits and health checks? (Determine whether overseas experience and costs are controllable)
3. **Governance Capabilities**: Are SSO/Team Quotas/Billing Center/Audit required? Who is responsible for budget caps and warnings? (Determine whether it can be scaled up)
4. **Delivery Strategy**: Default to low-price/domestic, high-end/overseas upgrades based on tasks (instead of all employees defaulting to high-end) (determines ROI and cost fluctuations)
5. **Copying method**: Whether the warehouse access template and SOP can be "copied with one click" (determines whether the pilot can be spread)

### 0.2 Quick diversion (select the "main plan" in one sentence)

```mermaid
flowchart TD
A[Preparing to introduce AI programming assistant] --> B{Code export/Is compliance allowed??}
B -- No/Uncertain --> C["Main force: Domestic (GLM/Qoder) <br/> first run through specifications, warehouse classification, auditing and SOP"]
B -- Yes --> D{Can overseas networks and procurement be closed-looped??}
D -- No --> C
D -- Yes --> E{Whether to unify IDE as a workbench?}
E -- Yes --> F ["Main force: Cursor (Business/Pro) <br/> domestically produced as a cover and downgrade"]
E -- No --> G["Main force: Claude Code / Codex / Gemini (CLI/plug-in) <br/> domestically produced as a cover and downgrade"]
C --> H [by warehouse classification + agent stratification + budget limit + rollback]
  F --> H
  G --> H
```

### 0.3 Default recommendation (applicable to most companies)

- **Default main force**: Domestic (GLM or Qoder) covers 70-85% of daily work (completion, small changes, single test draft, document draft).
- **Capacity enhancement**: A small number of overseas high-level agents (Cursor/Claude/Codex/Gemini) are only used for high-value tasks such as "cross-file reconstruction/troubleshooting/core module review/migration plan", and traces and acceptance are required.
- **Key to implementation**: Treat "warehouse classification + access template + budget limit + pilot evaluation indicators + rollback plan" as a set of engineering systems instead of issuing accounts.

---

## 1. What problem do we want to solve (implementation goals and boundaries)

### 1.1 Business goals (recommended to be written in OKR)

- **Efficiency**: Improve daily coding speed (completion, reconstruction, scaffolding, error checking, writing tests, writing documents).
- **Quality**: Reduce low-level errors, improve readability, consistency, single test coverage, and PR review quality.
- **Stable**: Core delivery will not be affected (can be downgraded/rolled back) in the event of network jitters/supplier current limiting/limit exhaustion.
- **Compliance**: Clarify which warehouses/files can be used for AI, and clear export, logs, retention, and auditing before going online.
- **Cost controllable**: Minimize the risk of "volume-based explosion" (budget, alarm, upper limit, tiered agents).

### 1.2 Scope boundaries (to prevent the project from getting out of control)

- This article only discusses the implementation of **subscription** AI programming products (IDE/CLI/Code Assist package), and **does not design a separate implementation plan for "direct API call"**.
- If you want to use AI for CI/CD automation, give priority to using the **official capabilities** provided by the supplier (such as PR Review, official CLI/plug-in). It is not recommended to self-develop "unlimited API calls".
- "AI-generated code" is always regarded as **external input**: it must pass testing, code review, and static inspection; it cannot be directly put into production.

### 1.3 Terminology (Allow cross-team alignment)

- **Completion**: Tab/Inline completion, generally the lowest cost and the highest benefit.
- **Chat / Agent**: Conversational code modification, cross-file reconstruction, reading and writing files, and running commands; higher cost and easier to touch compliance boundaries.
- **Agent tiering**: Not every developer uses the same tier; core members/architects/platform groups use higher tiers, and everyone else uses basic tiers.
- **Warehouse Sensitivity**: Confidential/restricted/strict compliance warehouses and open source/public warehouses have different allowed models and policies.

---

## 2. Selection principles (solve network and compliance first)

### 2.1 Two gates: first be able to use it, and then use it well

- **Gate A: Compliance and data boundaries** (can it be used and to what extent can it be used)
- Is code export allowed? What repository levels/directories/branches are allowed?
- Does it have to be auditable (who used what capability in what warehouse)? How are logs retained and who can access them?
- **Gate B: Network and procurement closed loop** (can it be used stably and can the cost be controlled)
- Is it possible to provide "IDE + CLI + login" with the same policy proxy, with alternate exits and health checks?
- Are account ownership, unified billing, cost allocation, budget caps and alarm responsible persons clear?

Conclusion: **Only if both thresholds have been passed, overseas capabilities are suitable for daily enhancement; if either threshold is not passed, priority will be given to implementing the domestic plan, running through SOP and governance, and then introducing it overseas. **

### 2.2 Prerequisite list (requires "verifiable" and avoids verbal promises)

- Overseas network is stable: there are health check data (delay/failure rate) and backup exits; IDE and CLI have the same policy; there are downgrade plans for failures.
- Compliance has been confirmed: the written conclusion clarifies the scope of outbound travel; the blacklist of sensitive directories is configurable; audit and retention requirements can be implemented.
- Procurement and payment can be closed-loop: unified billing and cost center; budget upper limit, alarm threshold, responsible person are clear; separation recovery process is clear.
- Usage management: team quota/personal upper limit/top downgrade strategy can be implemented (rather than "relying on consciousness").

### 2.3 How to compare (compare after the prerequisites are met)

| Dimensions                  | Weight suggestions | Scoring points (examples)                                                                                                         | How to verify (suggestions)                                                                       |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Compliance/Data             | 30%                | Outbound borders, sensitive path blocking, audit logs, corporate terms                                                            | Compliance written conclusion + Management backend capability verification + Pilot sampling audit |
| Governability               | 20%                | Team quota, SSO, member management, billing center, administrator policy                                                          | Management backend demo/screenshot + account recovery drill + billing sample                      |
| Experience and productivity | 20%                | Completion quality, cross-file editing, context, latency, stability                                                               | Pilot comparison using a unified task set (see scenarios in 6.1/8.2)                              |
| Cost and controllability    | 15%                | Subscription unit price, overage mechanism, whether it is easy to "explode according to volume", and whether it can be downgraded | Actual bill measurement + peaking downgrade drill + failure retry cost estimate                   |
| Integration capabilities    | 10%                | VS Code/JetBrains/CLI/PR Review support, configurability                                                                          | Access verification in 1-2 real repositories (templates/ignore rules/commands)                    |
| Supplier risk               | 5%                 | Regional availability, risk control, service SLA, payment risk                                                                    | Historical availability record + payment and risk control plan + substitutability assessment      |

Scoring suggestions: 1-5 points for each plan, multiplied by the weight; **Preset the weight and passing conditions** first, and then review and adjust after the pilot (to avoid "moving thresholds").

### 2.4 What should be delivered in the selection review (avoid leaving only one sentence "Choose A")

- Recommended conclusion: **main plan + backup/downgrade plan** (how to switch in case of failure/limit/risk control).
- Constraints: warehouse classification strategy, allowed capabilities (completion/dialogue/Agent), auditing and retention requirements.
- Agent design: tiering (L1-L4), upgrade process, personal upper limit and team quota, top downgrade strategy.
- Implementation plan: 12-week milestones (pilot scope, replication scope, acceptance metrics, and Go/No-Go).
- Risks and mitigation: compliance, network, suppliers, cost fluctuations, error correction and quality risks, and corresponding rollback plans.

---

## 3. Solution overview (the 4 implementable solutions we discussed)

> Tip: If the network/compliance is not ready, look at the GLM/Qoder lines first, and consider other options as alternatives first.

| Solution                     | Positioning                         | Typical individual monthly cost | Typical team 5 person-month cost | Key dependencies             | Applicable conclusions                                             |
| ---------------------------- | ----------------------------------- | ------------------------------- | -------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Cursor                       | AI IDE (unified workbench)          | ¥144 (Pro)                      | ~¥1,440 (Business)               | Overseas network/credit card | A team that prioritizes experience and is willing to unify the IDE |
| Claude Code / Codex / Gemini | Overseas subscription (plug-in/CLI) | ¥136-216                        | ¥900-1,900                       | Overseas network/credit card | Already have overseas bills, partial CLI/PR Review                 |
| GLM                          | Domestic high refresh limit         | ¥100 (Pro)                      | ~¥500 (Pro\*5)                   | No agent required            | Domestic compliance/reimbursement friendly, main solution          |
| Qoder                        | Domestic/hybrid routing             | ¥144-432 (Pro/Pro+)             | ~¥1,080 (Teams\*5)               | Mainly domestic              | Requires auditing and team management, hybrid routing              |

---

## 4. Price and quota (only keep the levels that are useful to enterprises/most people)

> Note: The following table is used for budget and agent design, not for "comparison model capabilities". What really affects the cost when it comes to implementation is: who uses the high-end, whether there is an upper limit, network stability (to reduce repeated calls), and whether there is a clear "default low-price model strategy".

:::note Quota caliber (first figure out what you are buying)

Products such as Cursor, Kiro, and GitHub Copilot are essentially "workbench/portal for using AI + engineering encapsulation of respective best practices", and they are not equivalent to a model itself.

When you buy a subscription, you usually buy two things at the same time:

1. **Tool capabilities**: IDE/plug-in/Agent workflow, context management, code indexing, team governance, etc.
2. **Model call quota for secondary encapsulation by the supplier**: externally expressed as "number of conversations/number of requests/quick requests/weekly quota", etc. (rather than token usage that you can directly reconcile).

The advantages and disadvantages also come from here:

- **Advantages**: You can switch/route between different models, and select the "stronger/cheaper/more stable" model according to the task; at the same time, the tool will give default prompts, workflows and anti-fool strategies.
- **Disadvantage**: You often cannot see the real token consumption and the marginal cost of a single request; when counting by "conversation/request", **simple tasks and complex tasks may consume the same 1 quota**, resulting in coarser cost prediction and audit granularity.

Implementation suggestions: The budget caliber is controlled by the upper limit of "agent + quota", and at the same time, the "default low-price model + peaking downgrade + high-level task approval/whitelist" is used to suppress fluctuations.

:::

### 4.1 Cursor (official website accessible: verified)

| Package  | Monthly Payment | Annual Payment Conversion | Applicable Group (Enterprise Implementation Suggestions) | RMB Estimate    |
| -------- | --------------- | ------------------------- | -------------------------------------------------------- | --------------- |
| Pro      | $20             | $200                      | Normal development (willing to use Cursor IDE)           | ¥144/month      |
| Pro+     | $60             | -                         | Core Developer/Architect (Heavy Agent)                   | ¥432/month      |
| Business | $40/user        | -                         | Teams requiring SSO/Audit/Team quotas                    | ¥288/user/month |
| Ultra    | $200            | -                         | Extremely heavy agent (specialized, platform group)      | ¥1,440/month    |

Source: https://cursor.com/pricing (grabbed to Pro/Pro+/Ultra/Business).

### 4.2 Overseas subscription (Claude Code / Codex / Gemini)

> Note: The pricing page of overseas products may not be easy to automatically crawl due to regional risk control (such as Cloudflare), login status or dynamic rendering; only the "ranges commonly used by enterprises" and common ranges are reserved below for budget discussion. Please check the supplier's official website and contract terms again before making a formal purchase.

| Plan               | Commonly used stalls for enterprises | Common prices (USD)                                       | Applicable people                 | Key points to note                                                              |
| ------------------ | ------------------------------------ | --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| Claude Code        | Pro / Teams                          | $20 / $40/user                                            | CLI/Agent heavy team              | Regional availability, weekly quota, overage policy                             |
| Codex / ChatGPT    | Team                                 | ~$25/user (annual payment) or ~$30/user (monthly payment) | Common across teams               | The webpage is difficult to crawl, check before purchasing; set a billing limit |
| Gemini Coding Plan | Standard / Enterprise                | $19 / $45                                                 | Teams with PR Review requirements | GCP billing system, daily quota, account management                             |

### 4.3 GLM Coding Plan (domestic, main force)

| Package | Monthly fee | Refresh cycle | Daily availability (4-5 refreshes) | Enterprise implementation suggestions |
| ------- | ----------- | ------------- | ---------------------------------- | ------------------------------------- |
| Pro     | ¥100        | Every 5 hours | 2400-3000 times                    | Default for most R&D                  |
| Max     | ¥400        | Every 5 hours | 9600-12000 times                   | Core Agent/Batch Tasks                |

### 4.4 Qoder (domestic/mixed)

| Package         | Monthly payment price (USD) | RMB estimate    | Business implementation suggestions |
| --------------- | --------------------------- | --------------- | ----------------------------------- |
| Pro             | $20                         | ¥144/month      | Regular seat                        |
| Pro+            | $60                         | ¥432/month      | Core seats/occasional heavy tasks   |
| Ultra           | $200                        | ¥1,440/month    | Extreme seats (special/platform)    |
| Teams (by seat) | $30/user                    | ¥216/user/month | Audit/team governance required      |

Note: The Qoder pricing interface will return the discount field (such as `discountedPrice` / `firstMonthPrice`), and the activity may change; the budget is recommended to be estimated based on the list price for more stability. \
Page:https://qoder.com/pricing. \
Interface (used to capture price/discount fields): https://qoder.com/api/v1/products/pricing?productType=personal_subscription, https://qoder.com/api/v1/products/pricing?productType=enterprise_subscription&planTier=Teams.

---

## 5. Enterprise-level agent design (how to buy without wasting)

### 5.1 Hierarchical agents (recommended)

| Level                          | Proportion recommendation | Target                                                     | Recommended gear (example)                    |
| ------------------------------ | ------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| L1 Normal development          | 70-85%                    | Daily completion + small changes                           | GLM Pro / Qoder Pro / Cursor Pro              |
| L2 core development            | 10-20%                    | Cross-file transformation, reconstruction, troubleshooting | Cursor Pro+ / GLM Max / Qoder Pro+            |
| L3 Review/Architecture         | 3-8%                      | Review, Design, Complex Migration                          | Claude Code Teams / Cursor Business / GLM Max |
| L4 platform and specialization | 1-3%                      | Standardized, templated, built-in process                  | Cursor Ultra (small amount) / GLM Max         |

### 5.2 Typical company size budget template

> The key here is "combination", not a la carte selection. You can treat overseas agents as "scarce resources" and manage them like a database/CI.

#### 10-person team (initial stage)

- 8 people: GLM Pro (8 \* ¥100 = ¥800/month)
- 2 people: Cursor Pro (2 \* ¥144 = ¥288/month) or Qoder Pro (2 \* ¥144 = ¥288/month)
- Total: Approximately ¥1,000/month (depending on combination)

#### 30-person team (business line)

- 24 people: GLM Pro (¥2,400/month)
- 4 people: GLM Max (¥1,600/month)
- 2 people: Overseas senior (Cursor Pro+/Claude Code Teams on demand)
- Total: Approximately ¥4,000-6,000/month

#### 100-person company (multiple business lines)

- 80 people: GLM Pro
- 15 people: Qoder Teams or GLM Max (depending on whether audit/team governance is required)
- 5 people: Overseas enhanced agents (Cursor Business/Claude Teams)
- Total: Determined based on audit requirements and the number of overseas agents. It is recommended to conduct pilot calculations before purchasing.

---

## 6. Implementation roadmap (multiple teams in the company will proceed step by step)

> Implementation is not about “opening all employee accounts in one day”, but about establishing a closed loop of **standards + pilots + replication + governance**.

### 6.1 Recommended Milestones (12-week template, adjustable to company pace)

| Cycle      | Goal                      | Key Delivery                                                                                    | Passing Standards (Can you advance to the next stage)                      |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Week 1-2   | Preparation and alignment | Usage specifications, agent plan, warehouse classification, budget and alarm, pilot list        | Agent available + compliance confirmation + budget controllable            |
| Week 3-6   | Pilot implementation      | The pilot team completes/dialogues/reviews the SOP; establishes an indicator dashboard          | The indicators are no worse than the baseline, and the cost is explainable |
| Week 7-10  | Copy expansion            | 3-5 teams in the same business line copy templates and solidify warehouse access specifications | Operation system can be scaled up (account/quota/training)                 |
| Week 11-12 | Company-level governance  | Agent stratification, audit process, resignation recovery, quarterly review mechanism           | Have rollback plan + able to output management reports                     |

### 6.2 Roles and RACI (it is recommended to determine responsibilities before implementation)

| Matters                                | R&D Manager | Platform/Middle Office | Security Compliance | Procurement Finance | Business Team TL |
| -------------------------------------- | ----------- | ---------------------- | ------------------- | ------------------- | ---------------- |
| Solution selection and principles      | A           | C                      | C                   | C                   | C                |
| Agent/Network Solutions                | C           | A/R                    | C                   | -                   | C                |
| Warehouse classification and red lines | C           | R                      | A/R                 | -                   | C                |
| Account/SSO/Recycling                  | C           | A/R                    | C                   | -                   | C                |
| Budget/Bill/Alarm                      | A           | R                      | C                   | A/R                 | C                |
| Training and Promotion                 | C           | R                      | C                   | -                   | A/R              |
| Pilot Acceptance                       | A           | R                      | C                   | C                   | A/R              |

Note: A=ultimate responsibility, R=executive responsibility, C=collaboration/consultation. It doesn’t matter if you don’t understand RACI: the key is that each item has a clear “person who makes decisions” and “person who does the work”.

### 6.3 How to conduct a pilot project so that the results can be “clear”

The failure of many pilot projects is not because the tools are not good, but because two things are not done well: **the caliber is not unified** and **the process is not reusable**. The goal of the following approach is simple: after the pilot is over, you can use data and cases to answer clearly - "Is it worth it, why is it worth it, and how to expand it next."

**(1) First write clearly: the conditions for passing/failing (to avoid starting the debate after the pilot is over)**

- Select 4 types of indicators (see stage 1): production capacity, quality, experience, cost; at least 1 "hard indicator" for each type.
- Write clearly the "minimum acceptable standards", for example:
- Quality does not decrease: CI failure rate and online defect rate are not higher than the baseline (or there are clearly explainable reasons).
- Cost controllable: The per capita monthly cost does not exceed the budget limit; peaking/fault retries can be absorbed by the downgrade strategy.
- The experience is usable: the 95th percentile latency and failure rate are within the acceptable range (data provided by the platform/IT).

**(2) Use a set of "real task samples" for comparison (to avoid "picking tasks")**

It is recommended to prepare 10-20 "real task samples", covering 8.2 high ROI scenarios, and record minimum information:

| Field                        | Description                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Task type                    | Completion/small bug/cross-file reconstruction/complementary single test/PR Review/documentation |
| Warehouse level              | S0/S1/S2 (determines allowed capabilities and tools)                                             |
| Complexity                   | Low/Medium/High (or Story Points)                                                                |
| Baseline time taken          | Average time taken for similar tasks before pilot (2-4 week window)                              |
| AI-assisted time consumption | Time consumption during the pilot period (including verification time)                           |
| Verification method          | What commands/screenshots/logs were run                                                          |
| Cost and failure             | Whether retries/excesses/agent failures occur (and how to downgrade them)                        |

**(3) First write down the common "pilot illusions" in the review (to avoid "looking improved")**

- **Selection bias**: Only the strongest/those who love to try new things can use it → Try to choose a "normal team", or do grayscale comparison in batches.
- **Freshness Effect**: There is a big improvement in the first 1-2 weeks, but then it falls back → Pilot for at least 2-4 weeks, and look at the performance in weeks 3-4 separately.
- **Wrong indicator selection**: Looking only at the number of submissions will encourage fragmentation → also look at quality indicators such as delivery cycle, rework rate, and defect rate.
- **External interference**: Major releases/major promotions/manpower changes will affect indicators → Record key events and compare only similar tasks when necessary.

**(4) 3 things that must be produced at the end of the pilot (otherwise it will be difficult to replicate)**

- "One-page conclusion": whether it is passed, whether the passing conditions are met, main benefits and costs, and whether expansion is recommended.
- "Copyable assets": warehouse access template (7.2), daily SOP (8), training materials, fault degradation plan (9.1.5).
- "Governance data": billing samples, number of peaks, number of downgrades, number of agent failures, sampling audit results.

### Phase 0: Basic Preparation (1-2 weeks)

**Output (deliverable)**

- "AI Programming Usage Specifications" (Do/Don’t, allowed warehouse/file types, handling of sensitive information).
- "Network and Agent Configuration Manual" (IDE/CLI Unified Agent, Troubleshooting).
- "Agent Stratification and Budget" (who can use what, how to apply for upgrade, how to deal with excess).
- "Audit and Trace Requirements" (log preservation, approval flow, rollback mechanism).

**Key actions**

- Network: Determine overseas proxy exports, whitelist domain names, stability indicators (such as 95th percentile delay < 300ms).
- Compliance: Establish "warehouse classification" (confidential/general/open source) and clarify the models and functions allowed at each level (only complete/allow Agent/prohibit upload).
- Procurement: Overseas credit card/virtual card management and control; domestic invoices and cost centers; setting budget caps and alarm responsible persons.
- Project: Unify the PR template and warehouse access template (`AI_RULES.md`/`.aiignore`/`.cursorignore`/`CLAUDE.md`), and require all new warehouses to bring them by default.
- Indicators: Collect a 2-4 week baseline (delivery cycle, number of PRs, defect rate, CI failure rate) before the pilot, otherwise the "effect" of the pilot cannot be objectively evaluated.

### Phase 1: Pilot (2-4 weeks, 1-2 low risk teams/warehouses)

**Principles for selecting pilots**

- Priority: Non-confidential, fast iteration, easy to quantify indicators (such as Web/tool chain/middle-end projects).
- Avoid choosing: strong compliance, strong auditing, heavy outsourcing, relying on complex and unquantifiable projects as the first pilot.

**Pilot Minimum Viable Configuration (MVP)**

- Main force: GLM Pro or Qoder Pro (covering most people’s daily life)
- Enhancement: 1-2 overseas agents (Cursor Pro or Claude Code Pro) for complex task comparison
- Strategy: Domestic/low-priced model by default; high-end models must be switched manually and the reasons recorded (see template below)

**Acceptance indicators (it is recommended to choose at least 4)**

- Capacity: number of submissions per person/number of PRs, lead time, rework rate (compared to the baseline 2-4 weeks before the pilot).
- Quality: number of problems found in PR review, online defect rate, unit test increment.
- Experience: completion adoption rate, average response time, failure rate/retry rate.
- Cost: per capita monthly cost, number of overage, and number of repeated calls caused by agent failure.
- Comparison caliber: Try to compare according to "similar tasks + same time window", and record key events such as version releases/demand peaks to avoid misjudgment of fluctuations as gains or losses (see 6.3).

**Rollback plan**

- One-click disabling: plug-ins/IDE can be quickly closed; routing is switched to domestic.
- Agent failure: Provide backup nodes/standby exits; clarify that "only completion is allowed, not Agent" during the failure.

### Phase 2: Business line expansion (4-8 weeks, same as business line replication)

**The key to copying is not to "send an account", but to "copy the template"**

- Copy: agent configuration, index blacklist, warehouse access template, training materials, indicator dashboard.
- Hierarchical routing:
- Baseline: domestic (GLM/Qoder) + local index.
- Improvement: Review/complex transformation is required to cut overseas high-quality models (approval or traces required).
- Limit: Set a monthly/weekly upper limit based on the team level, and automatically downgrade to domestic/low price when the limit is reached.

**Promotion Training**

- 10-15 minutes "quick start" training: shortcut keys, commonly used prompts, how to let AI write tests, and how to review AI output.
- 30-45 minutes "Advanced Training Camp" (core members): cross-file reconstruction, locating performance issues, generating migration plans, and splitting tasks.

### Phase 3: Company-wide scaling (ongoing)

**Corporate Level Governance Essentials**

- Accounts and permissions: SSO/member management; automatic recovery of resignation/job transfer; higher-level positions for key positions.
- Indicators and reports: monthly usage, excess, delay, number of failures, unit PR cost; output 1-page report to management.
- Specification solidification: Write the rule that "AI generated code must be tested/reviewed" into the project template and PR template.

### Phase 4: Optimization and Review (Quarterly Rhythm)

- Cost optimization: Concentrate the use of high-end models to the "maximum benefit" scenarios (review, migration, problems); use low-price/domestic products for daily use.
- Experience optimization: Optimize proxy and routing strategies based on delay and failure rates; switch main suppliers when necessary.
- Compliance review: update sensitive directory blacklist and outbound whitelist; sample audit call logs and PR records.

---

## 7. How to “implement it into every project” (warehouse access specifications)

### 7.1 Warehouse classification (strongly recommended for companies to unify)

| Levels            | Examples                      | Allowed capabilities                                                                                      | Suggested tools                             |
| ----------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| S0 (confidential) | Core algorithm, key warehouse | No exit; allowed local indexing; only domestically produced and prohibited from uploading sensitive files | GLM/Qoder (domestic, local index)           |
| S1 (internal)     | Most business warehouses      | Mainly domestic; overseas whitelist agents are available; must be audited                                 | GLM/Qoder + a small amount of Cursor/Claude |
| S2 (low risk)     | Open source/public/example    | Available overseas; more radical experiments possible Agent                                               | Cursor/Claude/Codex/Gemini                  |

### 7.2 "AI constraint file" that must be configured for each warehouse

> Goal: Let AI have project context while also making it clear "what can't be touched". The greatest value of these documents is to "reduce misuse and leakage" and allow new teams to quickly copy them.

**It is recommended to place them in the root directory of the warehouse:**

- `AI_RULES.md`: Team rules (allow/disallow uploading directories, how to ask questions, review requirements).
- `.aiignore`: Sensitive directory blacklist (`.env`, `secrets/`, `*.pem`, `id_rsa`, `*.p12`, `*.key`, etc.).
- `docs/ai/`: Put team prompt templates, examples, and FAQs.

**If using Claude Code:**

- `CLAUDE.md`: Declare the project structure, commands, test entrances, prohibited directories, and code style.

**If using Cursor:**

- `.cursorignore`: Same as `.aiignore`, and adds the construction product directory (`dist/`, `node_modules/`).

#### Template: `.aiignore` (it is recommended that the company unify and maintain it for a long time)

```gitignore
# Secrets / credentials
.env
.env.*
secrets/
**/secrets/
*.pem
*.key
*.p12
id_rsa
id_ed25519

# Customer / production data
data/
**/data/
*.sql
*.dump
*.bak
*.log

# Build outputs / noise
node_modules/
dist/
build/
coverage/
.turbo/
.next/
```

#### Template: `AI_RULES.md` (should be available in every warehouse)

```md
# AI usage rules (this warehouse)

## allow
- Allowed: completion, code explanation, small-scale changes (limited directory)
- Allow: Generate test draft (only add test files)
- Allow: Generate document draft (requires manual proofreading)

## prohibit
- Uploading/pasting is prohibited: any keys, certificates, customer data, unmasked logs, and database exports
- AI is prohibited from modifying: authentication/payment/risk control/data export related codes (must be manually led)
- It is prohibited to use overseas models in S0 warehouse

## Directory constraints
- Allow changes to directory: src/
- It is prohibited to change directories: secrets/, scripts/release/, infra/

## Verification requirements
- All AI changes must run: pnpm test
- Those with UI must provide: screenshots or screen recordings
```

#### Template: `.cursorignore` (Cursor warehouse)

```gitignore
# Prefer reusing .aiignore content
.env
.env.*
secrets/
node_modules/
dist/
build/
coverage/
.turbo/
.next/
```

#### Template: `CLAUDE.md` (Claude Code repository)

```md
# Project guidance for Claude Code

## Repo overview
- Tech stack: TypeScript (ESM), pnpm workspace
- Style: 2-space indent, keep changes minimal and focused

## Commands
- Install: pnpm install
- Test: pnpm test
- Lint: pnpm lint
- Format: pnpm format

## Do / Don't
- DO keep edits scoped; prefer small PRs
- DON'T touch secrets/, .env*, certificates, or customer data
- DON'T change release scripts unless explicitly asked

## Where to make changes
- Prefer editing: packages/**/src
- Tests live in: **/__tests__ or **/test
```

### 7.3 Two items that must be added to the PR template (to prevent AI from going straight to production)

- "Does this PR use AI to generate/rewrite code? If so, describe the scope of use and the verification done (testing/manual verification)."
- "When security/permissions/payment/data export changes are involved, security review must be flagged and requested."

### 7.4 Precipitate skills for each project (turn SOP into replicable assets)

> The Skill here refers to "reusable prompt words/workflow templates" (Local Skill of Codex CLI/internal Agent), not Claude Code's npm Skill (see [Skill (Skill System)](./basics/skill)).

#### 7.4.1 Why do it?

- **Produce "How to Ask AI"**: Solidify the high ROI questioning method so that newcomers can use it.
- **Reduce the risk of compliance and incorrect modifications**: Write prohibited directories, acceptance lists, and default commands into Skill to reduce oral communication.
- **Reduce duplicate communication costs**: Reuse SOPs for similar projects, and copy across teams faster.

#### 7.4.2 "Minimum Skill Kit" per project (at least 5 recommended)

| Skill (example naming) | What to solve | Required input (write into Skill) | Output/Acceptance Criteria (write into Skill) |
| ---------------------- | ------------- | --------------------------------- | --------------------------------------------- |
|                        |
|                        |
|                        |
|                        |
|                        |

> Supplementary options: add `project-ui-regression` to front-end projects (screenshots/comparisons), add `project-api-contract` to back-end projects (interface changes and compatibility), and add `project-ci-debug` to tool chain projects (CI failure location).

**Monorepo (pnpm workspace/Turbo, etc.) recommends adding 3 more**

- `monorepo-build-matrix`: Solidify the matrix of "how to build/test/lint each workspace" to avoid running the wrong command.
- `monorepo-deps-guard`: Rules for dependency upgrade/new dependency (workspace protocol, version range, lock file policy, rollback method).
- `monorepo-release-flow`: Step-by-step process for release and package release (change set/version number/product verification/rollback point).

**By item type, the most common “meal-added skills”**

| Project type                                     | Suggested new Skill      | Concerns (written into the constraints/acceptance of the Skill)                                               |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| UI/Mini program/Front-end application            |
| Core libraries/toolkits (packages)               |
| Performance sensitive module                     | `project-perf-check`     | Need benchmark comparison; avoid introducing O(n²); give performance verification method                      |
| e2e/snapshot-intensive project                   | `project-snapshot-guard` | Clarify when snapshot updates are allowed; updates must be accompanied by reasons and verification commands   |
| Documentation site/sample project (website/demo) |
| CI/Script/Release Link                           | `project-ci-debug`       | Only make minimal changes; reproduce first and then fix; rollback point and verification log must be provided |

**Enterprise-level skill library is recommended to be divided into 3 layers (to avoid "writing one copy for each project")**

- **Company Baseline**: Compliance red line, acceptance checklist, default output format, PR statement template.
- **Technology Stack Presets**: Common commands and directory conventions (testing/building/formatting) such as Node/Java/Go/small programs.
- **Project Overrides**: Only write the unique entrance, special directory, and special rollback strategy of this project.

#### 7.4.3 Skill specification template (unified input/output for easy copying and auditing)

In order to prevent skills from degenerating into "scattered prompt words", it is recommended that all project skills use the same specification template (the content can be streamlined, but the fields must be consistent):

```md
# Skill: <skill-name>

## Purpose (purpose/applicable scenario)
-What problem is solved? What tasks does it apply to? Which tasks does it not apply to?

## Guardrails (red lines and borders)
- Banned directories/file types:
- Prohibited behaviors (for example: changing authentication/payment/data export; changing publishing scripts):
- Allow directory changes:
- Are new dependencies allowed? (not allowed by default)

## Commands (Project Commands)
- Install:
- Build:
- Test:
- Lint/Format:

## Output Format (output format requirements)
- Change point list (file level)
- Risk points and compatibility description
- Verify commands and expected results
- Rollback strategy (how to revoke/how to split PR)

## Acceptance Criteria (Acceptance Criteria)
- What inspections/tests must be passed?
- Do you need screenshots/logs/performance comparison?
- Do I need to update the documentation/changelog/Changeset?
```

#### 7.4.4 Governance suggestions (to prevent Skill from becoming "scattered prompt words")

- **Attribution**: Company-level general skills are maintained by the platform/middle office; project skills are maintained by the project TL (but must go through code review).
- **Storage**: It is recommended to use an independent warehouse for centralized management (to facilitate versioning and auditing), and group it by "project/technology stack".
- **Change Management**: Skill updates must be accompanied by "verification tasks/verification commands"; major changes are first grayscaled in the pilot team.

---

## 8. Daily use of SOP (turning AI into standard procedures)

### 8.1 Default routing policy (the most important one)

- **Default**: Domestic/low-priced model (used for completion, small changes, error checking, writing comments, and generating test drafts).
- **Upgrade Conditions**: Cross-file refactoring, architecture migration, complex bugs, performance issues, core module PR review → Apply or switch to a higher-order model.
- **Prohibited Conditions**: Confidential warehouses, keys/certificates/personal information files, production logs that have not been desensitized, and customer data.

#### 8.1.1 Task classification and “what gear to use” (reduce arguments and reduce costs)

| Task type                          | Recommended default                          | When to upgrade to high-level/overseas                 | Acceptance points                            |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Tab completion/rename              | Domestic/low price                           | Generally not required                                 | lint/type check passed                       |
| Small-scale bug fixing (1-2 files) | Domestic/low price                           | Need to locate cross-module/complex concurrency issues | Minimum reproduction + single test coverage  |
| Refactoring (across 3+ files)      | Domestic (core seats can be advanced)        | Affect public API/core modules                         | Split PR + test for each step                |
| Single test completion             | Domestic/low price                           | Complex boundary/concurrency/timing                    | Reasonable assertion + coverage boundary     |
| PR Review                          | Domestic/low-priced (or comes with the tool) | Core module/security module                            | Only suggestions, manual judgment            |
| Documentation/change log           | Domestic production/low price                | External release, compliant text                       | Manual proofreading, avoiding factual errors |

#### 8.1.2 "Minimum Acceptance Checklist" for AI output (unified team caliber)

- Does the scope of changes comply with the constraints (directory/file/interface)?
- Are new dependencies or new permissions introduced? If so, has it been reviewed?
- Are reproducible verification methods (commands/screenshots/logs) provided?
- Did it pass: type checking, lint, single test (at least the part related to the change)?
- Have tests been added/updated to cover key branches?
- Are there any risk points (especially boundary conditions) that appear reasonable but have wrong business semantics?

### 8.2 Six types of high ROI scenarios (recommended to penetrate first)

1. **Completion and renaming**: Improve coding speed and low cost.
2. **Code explanation and bug location**: Let AI first provide possible causes + minimum recurrence paths, and then manually confirm.
3. **Reconstruction and abstraction**: Let AI propose a plan (step-by-step, small PR) first, and then execute it step by step.
4. **Single test generation**: Only drafts are generated; assertions and boundaries must be manually proofread; tests must be run.
5. **PR review**: AI will first scan out obvious problems (naming, null pointers, boundaries, performance), and humans will make the final decision.
6. **Documentation and Change Log**: Automatically generate drafts and manually proofread them before publishing.

### 8.3 Three habits that must be developed (otherwise the more you use them, the more chaotic they will become)

- **Constrain first and then generate**: Write clearly in the question "which files/directories must not be modified and which behaviors must be retained".
- **Small steps first and then merge**: AI is required to be "split into 3-5 small PRs", and each step can be rolled back and tested.
- **Verify before you believe**: AI output must pass single test/type check/static check; if it fails, it will be treated as a suggestion rather than a result.

One of the simplest ways to write it is: **Goal + Constraint + Acceptance**. After writing the three paragraphs, let the AI start working.

Example (minor changes):

- Not recommended: Help me fix this bug.
- recommend:

```text
Goal: Fix xxx issue (do not change existing behavior).
Constraints: Do not change the public API; do not add new dependencies; only allow changes to src/xxx; do not modify security/ and scripts/.
Acceptance: Give a list of change points + risk points; and provide the verification command (pnpm test / pnpm lint) that I should run.
```

### 8.4 Standard Prompt template (can be copied to the team)

The following three templates can be copied directly and the placeholders in them can be replaced as needed.

**Template A: Small changes (low price/domestic)**

```text
Goal: Complete [rename/organize/fix lint/fix small bugs] without changing the behavior.
Context: The warehouse is <repo-name>, and the relevant code is mainly in <path>.

constraint:
- No changes to the public interface (unless I explicitly allow it)
- No new dependencies
- Only changes allowed: <allowed-paths>
- Forbidden changes: <blocked-paths>

Output requirements:
1) Change point list (by file)
2) Risk points (possibly affected behaviors/boundaries)
3) What verification commands should I run (e.g. pnpm test / pnpm lint), and what should I expect to see?
```

**Template B: Cross-File Refactoring (Advanced/Core Agent)**

```text
Goal: Do a cross-file refactoring/abstraction (larger impact), but make it reviewable and rollable.

constraint:
- Split the changes into 3-5 steps (each step can be merged independently)
- Don't modify snapshot/lock files (unless I explicitly allow it)
- It is forbidden to touch high-risk directories such as security/ and scripts/release/
- Must maintain backward compatibility (or clearly write out the breaking points and give a migration plan)

Output requirements:
1) First give a step-by-step plan: which files to change at each step and why they are broken down in this way
2) Acceptance of each step: which tests/commands to run and expected results
3) Risk points: Which step is most likely to go wrong and how to roll back
```

**Template C: Single test generation**

```text
Goal: Complete critical path unit tests/integration tests for <function/module>.

constraint:
- Only new test files are allowed (do not change business logic)
- Coverage boundaries: null/undefined, empty array/empty string, exception branch, permissions/authentication (if any)
- If you need mocking, please explain the reason and scope of mocking (avoid excessive mocking)

Output requirements:
1) Test case list (use one sentence to describe what each case covers)
2) Reasons for the key assertion (why it is asserted)
3) What test commands should I run, and what should I expect to see?
```

---

## 9. Network, account, and compliance (the three hurdles that a company must pass before landing)

### 9.1 Connect the network of overseas models (required)

**Core principle: The same set of proxy policies covers IDE + CLI + browser login. **
Common failure modes are: the browser can log in, the IDE plug-in cannot be used, and the CLI direct connection is blocked, causing developers to retry repeatedly, causing delays to skyrocket and costs to amplify.

#### 9.1.1 Agent deployment recommendations (enterprise practice)

- Small scale (<20 people): You can use a single exit first, but you must have backup nodes and switching files.
- Medium and large-scale (20+ people): It is recommended that the platform/IT provide "unified agency services", with at least:
- Node health check and automatic switching
- Speed limit by user/team (to prevent a single person from filling up the bandwidth)
- Access logs (for troubleshooting and compliance audits, please note desensitization)

#### 9.1.2 CLI agent environment variables (must be unified)

macOS/Linux (`~/.zshrc` / `~/.bashrc`) example:

```bash
export HTTP_PROXY="http://127.0.0.1:7890"
export HTTPS_PROXY="http://127.0.0.1:7890"
export ALL_PROXY="socks5://127.0.0.1:7890"

# Do not use an agent for the intranet domain name and local address (supplemented according to the company’s actual situation)
export NO_PROXY="localhost,127.0.0.1,.corp.internal,10.0.0.0/8,192.168.0.0/16"
```

Windows PowerShell example:

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:NO_PROXY="localhost,127.0.0.1,.corp.internal"
```

#### 9.1.3 Common domain names that need to be released/reachable (choose based on the selected product)

- Cursor: `cursor.com`, `*.cursor.com`
- Claude/Anthropic: `claude.ai`, `claude.com`, `*.anthropic.com`
- OpenAI/ChatGPT: `openai.com`, `chatgpt.com` (Cloudflare risk control may be stricter in some areas)
- Google: `cloud.google.com`, `*.googleapis.com`, `*.gstatic.com`

Recommended practice: Maintain a "domain name whitelist" on the platform side and update it synchronously when network policies change.

#### 9.1.4 Health check and troubleshooting (allowing developers to help themselves)

- DNS: Confirm that the domain name can be resolved (the company's intranet DNS should not hijack these domain names).
- TLS: If the agent performs certificate replacement, it needs to clearly install the enterprise root certificate process (otherwise IDE/CLI will report a certificate error).
- Connectivity: Use lightweight requests such as `curl -I https://cursor.com/pricing` for detection.
- Experience indicators: At least record "average delay/95th percentile delay/failure rate", and be able to locate "network problems" or "supplier throttling".

Quick Self-Test (1-minute version for developers):

```bash
# 1) Can DNS be resolved?
nslookup cursor.com

# 2) Can I connect through an agent? (Just look at the HTTP status code)
curl -I https://cursor.com/pricing

# 3) If the CLI always fails, first check whether the environment variables have been overwritten.
env | grep -E 'HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY'
```

#### 9.1.5 Downgrade strategy in case of failure (must be written clearly)

- Agent exception: switch to the alternate exit; only completion is allowed before the switch is completed, and the Agent is not allowed to execute commands.
- Overseas quota is exhausted: downgrade to domestic or low-priced models, and freeze the use of high-end agents (to avoid "the more urgent the more money will be burned").
- Supplier is unavailable: switch to another available solution (for example, temporarily switch back to GLM/Qoder from Cursor).

### 9.2 Account and permission management (to avoid "resignation without recycling")

#### 9.2.1 Basic requirements (if you can do it, don’t “manually manage accounts”)

- **Priority Teams/Enterprise**: At least member management and unified billing; preferably SSO/audit logs.
- **Shared accounts are prohibited**: Shared accounts cannot be audited, and risks cannot be recovered when leaving the company.
- **MFA**: Require developers to turn on MFA (especially those with advanced agent/admin rights).

#### 9.2.2 Permission stratification and application process (institutionalizing "who can use advanced")

- L1 normal development: default basic gear (domestic Pro / Cursor Pro).
- L2 core development: nominated by the project leader or authorized by indicators (such as core module ownership).
- L3 review/architecture: Has cross-warehouse permissions, but must accept stricter auditing and usage specifications.
- Application for upgrade must include: warehouse name, usage scenario, expected period, verification method, and budget source.

#### 9.2.3 Resignation/transfer recycling (must be automated)

- Bind to IT/HR Offboarding process: account deactivation, agent recycling, API/plug-in token invalidation (if existing).
- Random check once a month: 5-10 accounts are randomly selected to check whether the employment status and permissions are too high.

### 9.3 Compliance red line (recommended to be written into the system)

#### 9.3.1 Clarify “what counts as sensitive” (give an executable definition)

- Credential types: key, certificate, token, private key, public key, CI key, signature file.
- Data categories: customer data, order/payment information, personal information, production database export, non-desensitized logs.
- Security: vulnerability details, attack and defense scripts, internal security policies, undisclosed architecture and domain name assets.

#### 9.3.2 Redline strategy (it is recommended to write it as a mandatory rule)

- **NO UPLOAD**: The above sensitive content is strictly prohibited from being pasted/uploaded to any external model.
- **Confidential warehouse is prohibited from exporting**: S0 warehouse prohibits overseas models by default; if you really need to use it, you must first desensitize it and go through approval.
- **Two-person review of high-risk modules**: For changes related to authentication/payment/risk control/data export, AI can only "suggest", and ultimately a two-person code review is required.
- **Log Traces**: At least keep records of "who used what capabilities in which warehouse"; the logs themselves must be desensitized and access rights controlled.

---

## 10. Key points for the implementation of the plan (disassembled by product: how to use it in the project)

> The emphasis here is on “implementation action” rather than product promotion. Each plan is written according to: Administrator preparation → Member use → Warehouse access → Governance and common pitfalls.

### 10.1 Cursor (overseas, experience first, suitable for unified IDE)

**Applicable**

- Hope to unify IDE/workbench and use "Completion + Agent" as the main workflow.
- Overseas networks, accounts and purchasing links have been closed-loop, and can provide stable agency and fault degradation.

**not applicable**

- Unable to provide stable overseas network (high latency/high failure rate) or unable to manage accounts and bills at the organizational level.
- Teams are strongly reluctant to switch IDEs (the costs of migration outweigh the benefits).

#### Administrator preparation (company/team level)

1. Confirm that the proxy and whitelist domain names are ready (see 9.1).
2. Select an agent strategy:

- General development: `Pro`
- Core development/architecture: `Pro+` (small amount)
- Requires SSO/Audit: `Business`
- Extremely severe special event: `Ultra` (very small amount)

3. If you log in to `Business`: Prioritize completing the SSO and member recovery process to avoid "account scattering".
4. Set team norms: which warehouses allow agents to be opened, and which warehouses only allow completion.

#### Members get started (individual level)

1. Install Cursor.
2. Configure the proxy at the system layer to ensure that Cursor, browser login, and terminal use the proxy consistently.
3. First solidify your daily habits:

- 80% Tab completion + minor changes
- 20% only use Agent for cross-file reconstruction/troubleshooting

4. When encountering an "unanswered question", give priority to adding constraints: do not change the behavior, do not change the public interface, and must pass the test.

#### Warehouse access (project level)

- Required: `AI_RULES.md` + `.cursorignore` (refer to 7.2 template).
- Recommendation: Write clearly "this warehouse verification command" in `AI_RULES.md` (for example, `pnpm test`, `pnpm lint`).
- Recommendation for large warehouses: pilot indexing in subdirectories (modules) first, do not feed the entire warehouse at once.

#### Governance and common pitfalls

- Pit 1: Agent jitter causes Agent to repeatedly fail and retry → increasing costs. Resolution: Downgrade to "Complete Only" on failure.
- Pitfall 2: The rules are not ignored and the product catalog is indexed → the quality of answers decreases and the time consumption increases. Resolution: Maintain `.cursorignore`.
- Pitfall 3: Refactoring too many changes at once → PR cannot be reviewed. Solution: It is mandatory to split PR.

### 10.2 Claude Code (overseas, strong CLI/Agent, suitable for reconstruction and troubleshooting)

**Applicable**

- The team prefers CLI workflow or needs stronger Agent execution capabilities (reading and writing multiple files, running commands, and step-by-step migration).
- There are already relatively standard engineering commands and warehouse specifications (installation/build/test/format), which are suitable for writing into `CLAUDE.md` solidification.

**not applicable**

- Project commands and engineering specifications are unstable (it can run today but cannot run tomorrow), or the "allowed/forbidden directories" cannot be clearly defined at the warehouse level.
- Organization-level boundary constraints and audits cannot be performed on command execution and file writing permissions.

#### Administrator preparation (company/team level)

1. Standardize the Node.js version (this repository uses `^22.18.0 || >=24.11.0`) and npm proxy policy so CLI installation is reproducible.
2. Activate agents (`Pro`/`Teams`) as a team and clarify which members have permission to use the S1/S2 warehouse.
3. Establish `CLAUDE.md` template library: one copy for different technology stacks (Node/Java/Go), copy it to the warehouse and use it.

#### Members get started (individual level)

1. Install CLI (example): `npm i -g @anthropic-ai/claude-code`.
2. Log in: Authorize according to the official process; be careful not to bind the company’s paid agents with your personal account.
3. Usage suggestions:

- Let Claude "write the plan" first, and then "execute it step by step"
- Require output for each step: change points + risk points + verification commands

#### Warehouse access (project level)

- Required: `CLAUDE.md` + `AI_RULES.md` + `.aiignore`.
- `CLAUDE.md` To be clear:
- How to run tests/build/format
- Allowed changes to directories and prohibited directories
- Code style and constraints (such as 2 spaces, ESM, no new dependencies)

#### Governance and common pitfalls

- Pit 1: Agent defaults to "can write files and run commands", and the permission boundaries are unclear. Solution: `CLAUDE.md` Write the allowed range clearly.
- Pitfall 2: Treat "execute the order" as the final answer. Solution: The command output must enter PR description and manual review.
- Pitfall 3: Complex migration is not split. Solution: It is required to output a 3-5 step migration plan first and merge it gradually.

### 10.3 Codex/ChatGPT Team (overseas, common to teams, partial to "knowledge + draft")

**Applicable**

- Common scenarios across teams: code interpretation, technical research, design drafts, review checkpoints, test case lists and other "output draft/list" tasks.
- I hope to use the Team/Enterprise version to unify members and bills, and leave the "in-depth code modification" to be completed in the IDE/CLI tool.

**not applicable**

- Use it as the main tool for "automatically implementing code changes" (when there is a lack of warehouse context and engineering constraints, the risk is high and the quality is uncontrollable).

#### Administrator preparation (company/team level)

1. Prioritize Team: Unify members, permissions, and bills to avoid personal reimbursement and account scattering.
2. Output team prompt specification:

- Constraints must be written (directory/interface/dependency/test)
- Must write the acceptance method (test command/screenshot/log)

3. Establish stricter rules for "core modules": AI can only provide suggestions and cannot directly implement changes.

#### Members get started (individual level)

- Typical usage:
- Explain unfamiliar code, do technical research, and write design drafts
- Generate PR Review checkpoint list
- Generate test case list (not directly change the business code)

#### Warehouse access (project level)

- Still need warehouse side rules: `AI_RULES.md` + `.aiignore`.
- Core Module PR Requirement: AI output must contain a "verify command" and state that it was executed in the PR description.

#### Governance and common pitfalls

- Pit 1: The lack of warehouse context leads to "looks right but is actually wrong". Solution: Let the model first restate the project constraints and existing implementation.
- Pitfall 2: Generating a lot of code without testing. Solution: Write "the test draft must be made up" into the SOP.

### 10.4 Gemini Coding Plan (overseas, partial to PR Review and GCP ecology)

**Applicable**

- PR Review assistance and quality scanning are core demands, and the team itself works a lot in the GCP ecosystem.
- Account and billing systems can be integrated into corporate governance (rather than individual individual accounts).

**not applicable**

- The team does not have a stable Google account and billing system, or cannot meet organizational-level member management and auditing requirements.

#### Administrator preparation (company/team level)

1. Confirm that the Google account and GCP billing system are available (otherwise the advancement will be stuck).
2. Clarify the rights and responsibilities of PR Review: AI is an auxiliary review, and the code owner is ultimately responsible for the decision and responsibility.
3. Select agents: Standard covers most people; Enterprise gives review roles or core projects.

#### Members get started (individual level)

- It is recommended to use Gemini for two types of tasks:
- PR Review: Prompt potential bugs, boundary conditions, and performance issues
- Code/configuration related to GCP: Easier to give suggestions within the ecosystem

#### Warehouse access (project level)

- The PR template is clear: AI Review is just a suggestion and must be manually confirmed and verified.
- For large PRs: limit the diff size, split the PR first and then review it with AI.

### 10.5 GLM (domestic main force, suitable for all employees)

**Applicable**

- Compliance and reimbursement friendly, we hope to quickly cover all employees and implement completion/minor changes/supplementary testing on a large scale first.
- We hope to stabilize the "default route" on the domestic/low-price side and control cost fluctuations through agent stratification.

**not applicable**

- Organizations that rely heavily on overseas ecology (accounts/plug-ins/models) and cannot accept domestic products as the default backing (this type usually needs to solve the Gate conditions first).

#### Administrator preparation (company/team level)

1. Use GLM Pro as the default agent (covering 70-85% of the population) and Max as the core seat.
2. Write "5-hour refresh" into the team schedule: batch refactoring/supplementary testing tasks will be executed after the refresh.
3. Establish a usage dashboard: daily/weekly peaking risk reminders (especially Max seats).

#### Members get started (individual level)

- Prioritize three things:

1. Tab completion
2. Small-scale bug fixing (requires reproduction and verification commands first)
3. Single test draft (required to cover boundaries and anomalies)

#### Warehouse access (project level)

- Required: `AI_RULES.md` + `.aiignore`.
- S0 warehouse: Only domestic products are allowed, and sensitive directory blacklist is forced to be enabled.

#### Governance and common pitfalls

- Pitfall 1: Misunderstanding of the refresh cycle leads to "the quota is suddenly used up". Solution: Concentrate batch tasks into the refreshed window.
- Pitfall 2: Treat AI as an "automatic submitter". Solution: Unified acceptance checklist (8.1.2) and PR template.

### 10.6 Qoder (domestic/hybrid, governance-friendly)

**Applicable**

- It not only requires domestic availability/compliance-friendliness, but also hopes to introduce overseas enhancements to a small number of warehouses/a small number of people, and requires auditing and team governance.
- I hope to make "hybrid routing" a controllable whitelisting capability (off by default, on on demand, traceable).

**not applicable**

- Hybrid routing cannot be approved and audited at the organizational level (otherwise the risk will focus on "on by default").

#### Administrator preparation (company/team level)

1. `Pro` for ordinary seats, `Pro+` for heavy/mixed requirements, and `Teams` for audit and member management.
2. Establish a hybrid routing whitelist: which warehouses/branches allow overseas models and who can open them.
3. Quota strategy: team quota + personal upper limit, automatically downgraded to domestic model when reaching the top.

#### Members get started (individual level)

- It is recommended to default to domestic routing and apply for hybrid only when "high-quality inference/migration solutions are really needed".
- For major changes, output the step-by-step plan first, and then start changing the code.

#### Warehouse access (project level)

- Required: `AI_RULES.md` + `.aiignore`; for the team version, it is recommended to enable auditing and operation traces.
- For confidential warehouses: forcefully close overseas routing.

#### Governance and common pitfalls

- Pitfall 1: Hybrid routing “on by default” will directly introduce compliance risks. Solution: Default is off, approval is on.
- Pitfall 2: The lack of audit makes it difficult to trace the problem. Solution: Enable auditing in the team version and conduct regular spot checks.

---

## 11. Execution Checklist (check each item when the company is launched)

### 11.1 Decision-making and procurement

- [ ] Complete Gate A/B: Written conclusion on compliance outbound scope + Overseas network and procurement closed-loop confirmation.
- [ ] Clarify the default main force (domestic/overseas) and enhanced agent strategies.
- [ ] Select the agent tier and quantity (L1/L2/L3/L4).
- [ ] Billing center, budget limit, and alarm responsible person.
- [ ] Supplier availability assessment (region, risk control, payment).
- [ ] Output selection review deliverables (see 2.4): main force + downgrade, constraints, implementation plan, risk and rollback.

### 11.2 Network and Compliance

- [ ] Overseas agents are available (same policy as IDE/CLI), with backup exits.
- [ ] Agent health check and failure degradation strategies are enforceable (see 9.1.4/9.1.5).
- [ ] Warehouse classification (S0/S1/S2) is completed and the policy is bound.
- [ ] The sensitive directory blacklist (`.env`/`secrets/`/certificate/customer data) is solidified into the template.
- [ ] Auditing and traceability (who uses it, in which warehouse, and what is done) are traceable.

### 11.3 Project access

- [ ] Each warehouse lands `AI_RULES.md` / `.aiignore` / (optional) `CLAUDE.md` / `.cursorignore`.
- [ ] Key workflows are precipitated into project skills (see 7.4), and verified to be available with 1-2 real tasks.
- [ ] PR template adds AI usage statement and verification instructions.
- [ ] Solidify "must run tests/must code review" into engineering specifications.

### 11.4 Operation and review

- [ ] Pilot indicator dashboard (efficiency/quality/experience/cost) established.
- [ ] Pilot "one-page conclusion" and replicable asset accumulation (see 6.3): templates, SOPs, training, downgrade plans, bill samples.
- [ ] Monthly review mechanism: agent adjustment, routing adjustment, agent optimization, compliance spot checks.
- [ ] Rollback plan drill (agent failure/limit exhaustion/supplier unavailability).
