---
title: OpenAI SDK
description: Trace every OpenAI model call with a one-line wrapper — @lookspan/openai.
---

`@lookspan/openai` wraps an OpenAI client so every model call emits a Lookspan
span — no OTel, no proxy, no other code changes. It returns the same client
type, and calls behave identically.

## Install

```bash
npm install @lookspan/openai
```

## Usage

```typescript
import OpenAI from 'openai';
import { observeOpenAI } from '@lookspan/openai';

const openai = observeOpenAI(new OpenAI());
await openai.chat.completions.create({ model: 'gpt-4o', messages });
```

That's it — start `npx lookspan` and the call shows up as a trace with its
model, token usage and (server-computed) cost.

## What gets traced

The wrapper intercepts the common OpenAI surface and tags each with a span type:

| Method | Span type |
|---|---|
| `chat.completions.create` | `llm_call` |
| `responses.create` | `llm_call` |
| `embeddings.create` | `embedding` |

Token usage is read from the response (`prompt_tokens` / `completion_tokens`, or
`input_tokens` / `output_tokens` for the Responses API). **Streaming** is
supported: OpenAI sends usage in the final chunk (with `include_usage`), and the
wrapper accumulates the streamed text into the span's output.

## Options

`observeOpenAI(client, options)` accepts the
[shared option bag](/lookspan/sdks/#shared-options) — `endpoint`, `agentId`,
`sessionId`, `parentTraceId`, `captureContent`, etc. For example, to attribute
calls to an agent and a session:

```typescript
const openai = observeOpenAI(new OpenAI(), {
  agentId: 'researcher',
  sessionId: 'run-2026-06-08',
});
```

Content is omitted by default. To enable Replay & judge for spans whose prompts
and replies are safe to persist, opt in explicitly:

```typescript
const openai = observeOpenAI(new OpenAI(), { captureContent: true });
```
