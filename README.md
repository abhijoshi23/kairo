# Kairo

A personal AI assistant on the web. One chat page, one API route, and a thin
adapter that lets you point it at Claude, OpenAI, Groq, or a model running
locally on your own machine — by changing a single environment variable.

Built as a learning project: every non-obvious file has comments explaining
*why* it looks the way it does. Start with [`LEARN.md`](./LEARN.md) if you want
the guided tour.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then add your API key (see below)
npm run check                # verifies the key works before you start
npm run dev                  # http://localhost:3000
```

`npm run check` makes one small real request and tells you exactly what is
wrong if it fails — bad key, wrong model ID, no credit, Ollama not running.
Use `npm run check -- --models` to list the model IDs your key can call.

### Picking a provider

Set two variables in `.env.local`:

| Provider | `LLM_PROVIDER` | Cost | Where to get the key |
|---|---|---|---|
| Groq | `groq` | Free tier, no card | [console.groq.com/keys](https://console.groq.com/keys) |
| Ollama | `ollama` | Free, runs locally | none — [ollama.com/download](https://ollama.com/download) |
| Claude | `anthropic` | Prepaid credits | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| OpenAI | `openai` | Prepaid credits | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### Turning on web search

Optional. Without it Kairo says "I can't verify that"; with it, it looks things
up and cites what it found.

| Provider | `SEARCH_PROVIDER` | Free allowance | Key |
|---|---|---|---|
| Tavily | `tavily` | 1,000 credits/month | [app.tavily.com](https://app.tavily.com) |
| Serper | `serper` | 2,500 searches/month | [serper.dev](https://serper.dev) |

Tavily returns cleaned page extracts (better answers); Serper returns Google
snippets (bigger allowance). Brave's free tier ended in February 2026.

`LLM_MODEL` is optional; leave it blank to use each provider's default.

---

## Make it *yours*

Open **`src/lib/persona/profile.ts`** and fill it in. That file is the only
thing the model knows about you — it has no memory between conversations, so
whatever is in there is its entire world.

Be specific. "Software engineer" produces a generic assistant; "backend
engineer, 4 years on payments infrastructure, currently learning LLM tooling"
produces one that can actually answer questions about you.

The rules that keep it honest live in `src/lib/persona/index.ts`.

---

## How it fits together

```
Browser                          Your server                    Provider
────────                         ───────────                    ────────
Chat.tsx
  └─ useChat.ts
       POST /api/chat  ───────►  route.ts
                                   ├─ rate limit
                                   ├─ validate (zod)
                                   ├─ buildSystemPrompt()
                                   └─ getProvider().stream()  ──►  Claude /
                                                                   OpenAI /
       ◄── NDJSON stream ───────  ◄── SSE stream ──────────────────  Groq /
       append text as it arrives                                     Ollama
```

When search is on, `/api/chat` is not one model call but a loop:

```
model: "call web_search{query}"  →  you run it  →  "<search_results>…</search_results>"
                                                      ↓
model: "…and here is the answer, citing [1][2]"
```

Each turn re-sends the whole conversation plus every result so far, so cost
grows faster than linearly. The loop is capped at 3 tool rounds and 4 searches;
on the final round the tools are withdrawn, which forces an answer.

The key architectural decision: **the browser never talks to the LLM directly.**
Your API key lives only on the server. A frontend-only version of this app
would hand your key to anyone who opens devtools.

### Project layout

```
src/
├── app/
│   ├── api/chat/route.ts     the server endpoint — key handling, validation, streaming
│   ├── layout.tsx            HTML shell
│   ├── page.tsx              server component, renders <Chat/>
│   └── globals.css           Tailwind + markdown typography
├── components/
│   ├── Chat.tsx              page layout, empty state, message list
│   ├── MessageBubble.tsx     one turn, markdown-rendered
│   └── Composer.tsx          the input box
└── lib/
    ├── llm/
    │   ├── types.ts              the LLMProvider contract everything codes against
    │   ├── sse.ts                hand-rolled Server-Sent Events parser
    │   ├── anthropic.ts          Claude's Messages API
    │   ├── openai-compatible.ts  one impl covering OpenAI + Groq + Ollama
    │   └── index.ts              picks a provider from env
    ├── persona/
    │   ├── profile.ts        ← EDIT THIS: the facts about you
    │   └── index.ts          assembles the system prompt
    ├── search/
    │   ├── tavily.ts / serper.ts   one interface, two search back-ends
    │   └── index.ts                picks one from env, or none
    ├── tools/index.ts        the tool surface — read as a security boundary
    ├── auth.ts               signed session cookies, constant-time compares
    ├── rate-limit.ts         cheap spend guard
    └── useChat.ts            client-side streaming + state
```

---

## Security

Kairo is private by default. `src/middleware.ts` gates every route except the
login screen, and a deployed instance with no `APP_PASSPHRASE` **refuses to
serve at all** rather than running wide open.

Why this matters more than it looks: an unauthenticated LLM endpoint on a
public URL is a free API proxy billed to your card, and bots scan for exactly
that. The passphrase closes it.

How the session works — worth reading, it is only ~100 lines in
`src/lib/auth.ts`:

- The cookie holds **no secret**: an expiry plus an HMAC of that expiry, signed
  with a key only the server knows. Forging one requires the key.
- The signing key is derived from `APP_PASSPHRASE`, so changing the passphrase
  invalidates every live session — your panic button if it leaks.
- The cookie is `HttpOnly` (script cannot read it), `SameSite=Lax` (not sent on
  cross-site POSTs) and `Secure` in production (HTTPS only).
- Both comparisons are constant-time, and the passphrase is hashed before
  comparison so the check does not leak its length.
- Login is rate-limited to 8 attempts per minute with a 400ms delay on failure.

### What is still not protected

Be clear-eyed about the limits:

| Control | Reality |
|---|---|
| Rate limiter | In-memory, per serverless instance. A stumble guard, not a spend guard. Move it to Redis (Upstash) if you need a real one. |
| `clientKey()` | Trusts `x-forwarded-for`, which is only safe because **Vercel overwrites it**. On a VPS or behind your own nginx it is spoofable — fix it before hosting elsewhere. |
| Prompt injection | Now a live concern: search pulls text written by strangers into the prompt. Results are wrapped in `<search_results>` tags, our own tags are stripped from the content first (delimiting without escaping the delimiter is the SQL-concatenation mistake), each result is truncated, and the prompt says the block is data. Mitigation, not a guarantee. |
| SSRF | The model can search but **cannot fetch a URL**. That omission is the point: a "read this page" tool lets an attacker aim the server at cloud metadata (169.254.169.254) or internal services. A query string cannot address a host. Think hard before adding fetch. |
| `profile.ts` | Public twice over — it is in this repo, and injection can extract the system prompt. **Put nothing there you would not publish.** |

**The one control an attacker cannot bypass is a hard spend limit in your
provider's billing console.** Set it before you deploy.

## Deploying

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Under **Settings → Environment Variables**, add:
   - `APP_PASSPHRASE` — generate with `openssl rand -base64 24`
   - `LLM_PROVIDER` and the matching API key
4. Deploy, then set a spend limit in your provider's billing console.

Do **not** commit `.env.local` — it is gitignored for a reason. If a key ever
lands in a commit, rotate it; deleting the commit is not enough, because it
stays in the history and bots scrape for exactly this.

Ollama will not work on Vercel (the model runs on your laptop, not theirs).
Use a hosted provider for anything you deploy.

---

## Where to take it next

Roughly in order of effort:

- **Conversation history** — persist chats to `localStorage`, then to a database.
- **RAG** — embed your resume, notes and project docs, retrieve the relevant
  chunks per question, and inject them into the prompt. This is what lets the
  assistant answer from documents instead of a hand-written profile.
- **Tool use / function calling** — let the model call real functions: check
  your calendar, search the web, query an API.
- **Evals** — write a set of questions with expected answers and score changes
  to the prompt against them. The only way to know a prompt edit helped.
- **Auth** — gate the private version behind a login, keep a public read-only one.

---

## Scripts

```bash
npm run dev        # dev server with hot reload
npm run build      # production build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
npm run check      # verify provider + key
npm run check -- --models   # list model IDs your key can use
```
