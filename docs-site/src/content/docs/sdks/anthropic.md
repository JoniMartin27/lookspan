---
title: Anthropic SDK
description: Trace every Anthropic model call with a one-line wrapper — @lookspan/anthropic.
---

`@lookspan/anthropic` wraps an Anthropic client so every `messages.create`
call — including streaming — emits a Lookspan span. Same client type, identical
behavior.

## Install

```bash
npm install @lookspan/anthropic
```

## Usage

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { observeAnthropic } from '@lookspan/anthropic';

const anthropic = observeAnthropic(new Anthropic());
await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages,
});
```

## What gets traced

| Method | Span type |
|---|---|
| `messages.create` | `llm_call` |

Streaming is supported — the wrapper accumulates the streamed text into the
span's output and reads token usage from the response. Cost is computed
server-side from the model name against Lookspan's
[pricing table](/lookspan/guides/pricing-and-cost/).

## Options

`observeAnthropic(client, options)` accepts the
[shared option bag](/lookspan/sdks/#shared-options). For example:

```typescript
const anthropic = observeAnthropic(new Anthropic(), {
  agentId: 'planner',
  sessionId: 'run-2026-06-08',
});
```

Set `{ captureContent: false }` to keep prompts and replies out of Lookspan
(this also disables Replay & judge for those spans).
