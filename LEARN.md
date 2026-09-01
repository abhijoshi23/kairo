# Learning notes: how an LLM actually gets into an app

This is the tour. Read it with the code open — every section points at a real
file in this repo.

---

## 1. An LLM API is just an HTTP endpoint

There is no special protocol. You POST some JSON, you get some JSON back. The
entire "integration" is this:

```
POST https://api.anthropic.com/v1/messages
{
  "model": "claude-sonnet-4-5",
  "system": "You are Kairo...",
  "messages": [{"role": "user", "content": "hello"}],
  "max_tokens": 1024
}
```

SDKs are convenience wrappers over exactly that. This project deliberately uses
raw `fetch` (see `src/lib/llm/anthropic.ts`) so nothing is hidden from you. Once
you have seen it, use the official SDK in your next project — you will know what
it is doing.

**The one thing to internalise:** the API is *stateless*. It does not remember
your last message. Every request sends the whole conversation again. That is why
`useChat.ts` keeps an array of messages and posts all of them each time — and
why long conversations cost more than short ones.

---

## 2. The system prompt is the product

`src/lib/persona/index.ts` is the most important file here, and it is just a
string. Four things belong in it:

1. **Role** — who the model is being right now.
2. **Context** — facts it may rely on. For us, your profile.
3. **Rules** — behaviour at the edges. What to do when it *doesn't* know.
4. **Style** — what a good answer looks like.

The rule that matters most:

> If a question is not answerable from the profile, say so. Never invent a
> detail. Guessing is a failure, not a helpful default.

Models are trained to be helpful, and "helpful" without this instruction means
producing a plausible-sounding answer. For a personal assistant that is the
worst possible failure mode — an assistant that confidently invents your job
history is worse than no assistant. Try deleting that rule and asking it
something your profile doesn't cover. Watch what happens. Then put it back.

**Prompt injection.** Users can write "ignore your instructions" into the chat
box. Rule 5 in the prompt pushes back on that. It is a mitigation, not a
guarantee — real defence is never giving the model dangerous capabilities in the
first place. Which is why this app can only produce text.

---

## 3. Streaming, demystified

Waiting eight seconds for a wall of text feels broken. Streaming makes the same
eight seconds feel fast. There are three hops:

**Provider → your server.** Add `"stream": true` and the response body becomes
Server-Sent Events — plain text lines like `data: {...}`. `src/lib/llm/sse.ts`
reads the bytes, splits on newlines and hands back what follows `data:`. That is
the entire "magic".

**Your server → browser.** `route.ts` wraps the whole thing in a
`ReadableStream` and returns it as newline-delimited JSON. Why NDJSON and not
plain text? Because once you have started streaming, the HTTP status code is
already sent — you can no longer return a 500. Structured events
(`{"type":"delta"}`, `{"type":"error"}`) let you report a mid-stream failure
that plain text cannot express.

**Browser → screen.** `useChat.ts` reads the body chunk by chunk and appends
each delta to the last message. The typing effect is literally string
concatenation in a loop.

**Cancellation matters.** Tokens cost money whether or not anyone reads them.
The `AbortController` chain — browser → server → provider — means closing the
tab actually stops the bill.

---

## 4. Why the key lives on the server

The most common beginner mistake in an LLM app is calling the provider from the
frontend. Anything in browser JavaScript is public: `NEXT_PUBLIC_` variables,
bundled constants, network requests. Someone finds the key, and the bill is
yours.

The pattern this repo uses — a server route that holds the key and proxies the
call — also buys you the three things in `route.ts`:

- **Rate limiting** (`rate-limit.ts`), so a runaway loop can't drain your credit.
- **Validation** (zod), so you don't pay to process a 10MB message.
- **A place to put the system prompt** the user can't see or override.

Read the honest caveat at the top of `rate-limit.ts`: an in-memory counter
resets on restart and isn't shared between serverless instances. For production
you'd move it to Redis. Knowing the limits of your own code is part of the job.

---

## 5. Why the provider abstraction is worth it

`src/lib/llm/types.ts` defines one interface:

```ts
stream(options: StreamOptions): AsyncGenerator<string>
```

Everything else in the app codes against *that*, never against a vendor. The
payoff shows up in `openai-compatible.ts`: OpenAI's `/chat/completions` shape is
a de-facto standard, so OpenAI, Groq and Ollama are one implementation with
different base URLs. Claude gets its own file because its API differs in two
ways worth knowing:

- the system prompt is a **top-level field**, not a message in the array
- `max_tokens` is **required**, not optional

Switching providers is now `LLM_PROVIDER=groq`. That is not just tidiness —
model prices and quality move fast, and being able to A/B two providers in ten
seconds is a real advantage.

---

## 6. Exercises

Work through these in order; each one teaches something the last didn't.

1. **Feel the temperature.** Set `LLM_TEMPERATURE=0` and ask the same question
   three times. Then `1.5`. Now you know what that number does.
2. **Break the prompt.** Delete the accuracy rule, ask about something not in
   your profile, and watch it confabulate. Restore it.
3. **Add a token counter.** The final SSE event from each provider carries usage
   data. Surface it in the UI. Now every reply has a visible cost.
4. **Persist conversations.** Save messages to `localStorage`, add a sidebar.
   You'll immediately hit the context-window problem: what do you do when the
   history no longer fits? (Answer: summarise old turns. Try it.)
5. **Add a tool.** Give the model one function — `get_current_time` is enough —
   using your provider's tool-calling API. The loop is: model asks to call the
   tool → you run it → you send the result back → model answers. This is the
   single biggest step up in capability, and it is the foundation of agents.
6. **Write five evals.** Five questions, five expected answers. Run them after
   every prompt change. Without this you are editing prompts by vibes.

---

## Glossary

- **Token** — roughly ¾ of a word. Billing and context limits are measured in these.
- **Context window** — the maximum tokens (prompt + reply) one request can hold.
- **Temperature** — randomness. 0 is near-deterministic; high values wander.
- **System prompt** — instructions that sit above the conversation.
- **Hallucination** — a fluent, confident, false answer. Mitigated by prompting, grounding, and citations.
- **RAG** — Retrieval-Augmented Generation: search your documents, paste the relevant chunks into the prompt.
- **Tool / function calling** — the model returns a request to run one of your functions instead of text.
- **Streaming** — sending the reply token by token as it is generated.
