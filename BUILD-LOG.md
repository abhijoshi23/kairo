# Build log: how Kairo was actually built

A record of the process, kept because the *order* of the steps and the
mistakes along the way are more instructive than the finished code.

---

## 0. Decide before building

Four questions, asked before a single file existed:

- **Stack?** → Next.js + TypeScript
- **Which LLM?** → provider-agnostic
- **How personal?** → system prompt only, no RAG yet
- **Where does the code live?** → on the Mac, in `~/Documents`

These are not preferences. Each one changes the architecture. "Provider-
agnostic" is why `src/lib/llm/types.ts` exists at all — had the answer been
"just Claude", that whole directory would be one file with a `fetch` in it.
Guessing here means rewriting later.

## 1. Check the ground before standing on it

```
node -v        → v22.23.2      ✓
npm -v         → 10.9.8        ✓
git --version  → 2.34.1        ✓
gh --version   → not found     ← shaped the GitHub step later
npm ping       → PONG 688ms    ✓ registry reachable
```

Thirty seconds that prevents discovering a missing dependency halfway through.
The absent `gh` CLI is why the GitHub step ended as manual commands rather than
one automated call.

## 2. Skip the scaffolding tool

No `create-next-app`. Every config file — `package.json`, `tsconfig.json`,
`next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example` — was
written by hand.

The generator produces files you did not choose and cannot explain. For a
learning project that is the wrong trade. Fifteen lines of `package.json` you
understand beat a hundred you inherited.

`.gitignore` was written **before** `.env.example`, deliberately. Secrets should
be excluded before the file that resembles one exists.

## 3. Build bottom-up, in dependency order

```
types.ts            the LLMProvider contract        (depends on nothing)
  └─ sse.ts         SSE parsing
       └─ anthropic.ts / openai-compatible.ts
            └─ index.ts        env → provider
                 └─ persona/   system prompt
                      └─ api/chat/route.ts
                           └─ useChat.ts
                                └─ components/
```

Each layer compiles against something that already exists. Nothing is stubbed,
nothing is written twice.

Writing `types.ts` first is what forces the abstraction to be real. Once the
interface is `stream(options) => AsyncGenerator<string>`, the Anthropic and
OpenAI files have no choice but to conform — and the payoff arrives immediately:
OpenAI, Groq and Ollama collapse into one 60-line file.

## 4. The design decisions, and why

| Decision | Alternative | Why |
|---|---|---|
| Raw `fetch`, no vendor SDKs | `@anthropic-ai/sdk` | Nothing hidden. You see the actual HTTP request. Use SDKs next project — you'll know what they do. |
| One `openai-compatible.ts` for 3 providers | Three files | `/chat/completions` is a de-facto standard. Only the base URL differs. |
| NDJSON server→browser | Plain text | Once streaming starts the status code is already sent. You cannot return a 500. Typed events can express a mid-stream error; raw text cannot. |
| `AbortController` chained browser→server→provider | Let it run | Tokens cost money whether or not anyone reads them. |
| API route holds the key | Call the LLM from the browser | Anything in browser JS is public. This is the single most common beginner mistake in LLM apps. |

## 5. Verify in three widening circles

**Types.** `tsc --noEmit` → clean.

**Build.** `next build` compiled successfully, then died:

```
EPERM: operation not permitted, unlink '.../.next/export/404.html'
```

Worth pausing on: *this was not a code bug.* The sandbox that mounts the
Documents folder cannot delete files. Diagnosing environment-vs-code correctly
is most of debugging. Proved it by copying the source outside the mount,
symlinking `node_modules`, and rebuilding — clean, with a full route table.

**Behaviour.** Types and builds prove nothing about whether it *works*. So:

1. Wrote a throwaway HTTP server that speaks the OpenAI SSE format.
2. Pointed `LLM_PROVIDER=ollama` + `OLLAMA_BASE_URL` at it.
3. Ran the production server and curled the real endpoint.

Results:

```
POST /api/chat  → {"type":"delta","text":"Hello"} … {"type":"done"}
messages: []    → 400
GET  /          → 200
mock server saw: "You are Kairo, the personal AI assistant of Abhi…"
```

That last line is the one that matters. It proves the system prompt was
assembled and actually transmitted — not merely that the code compiled.

The same technique built the `npm run check` doctor later: a second mock, then
every failure branch exercised (no `.env.local`, empty provider, unknown
provider, missing key, success, `--models`).

## 6. Git, and a trap

First commit succeeded — 25 files, no `.env` tracked. But the sandbox left
stale lock files it could not remove:

```
.git/HEAD.lock
.git/index.lock
.git/objects/maintenance.lock
+ 35 orphaned tmp_obj_* files
```

Those would have broken git on the Mac with `Unable to create '.git/HEAD.lock':
File exists` — a confusing error hours later, far from its cause. Requested
delete permission, removed them, then confirmed with `git fsck` and a clean
`git status`.

Cleaning up your own mess immediately is cheaper than explaining it later.

## 7. Research facts, don't recall them

For the API-key guide, model prices and IDs were fetched from the live docs
rather than answered from memory. Prices and model names change monthly;
confidence is not a substitute for checking.

This also caught an overreach: `.env.example` claimed Groq's free tier needs no
credit card. The official docs did not state that, so the claim was softened in
its own commit. An unverified detail in a config file is still an unverified
detail.

---

## The method, compressed

1. Ask the questions whose answers change the architecture.
2. Verify the environment before depending on it.
3. Write the interface before the implementations.
4. Build bottom-up so nothing is stubbed.
5. Prove behaviour, not just compilation — a mock provider costs five minutes.
6. Separate environment failures from code failures.
7. Clean up artifacts of your own process before they become someone's bug.
8. Look things up.
