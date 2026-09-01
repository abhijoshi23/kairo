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
cp .env.example .env.local   # then add your API key
npm install
npm run dev                  # http://localhost:3000
```

### Picking a provider

Set two variables in `.env.local`:

| Provider    | `LLM_PROVIDER` | Key needed              | Notes                                        |
|-------------|----------------|-------------------------|----------------------------------------------|
| Claude      | `anthropic`    | `ANTHROPIC_API_KEY`     | console.anthropic.com                        |
| OpenAI      | `openai`       | `OPENAI_API_KEY`        | platform.openai.com                          |
| Groq        | `groq`         | `GROQ_API_KEY`          | Free tier, very fast — good for experimenting |
| Ollama      | `ollama`       | none                    | `ollama serve` + `ollama pull llama3.2`      |

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
    ├── rate-limit.ts         cheap spend guard
    └── useChat.ts            client-side streaming + state
```

---

## Deploying

Vercel is the path of least resistance for a Next.js app:

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add `LLM_PROVIDER` and your API key under **Settings → Environment Variables**.
4. Deploy.

Do **not** commit `.env.local` — it is gitignored for a reason. If a key ever
lands in a commit, rotate it; deleting the commit is not enough.

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
```
