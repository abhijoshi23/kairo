import { z } from "zod";

import { getProvider, LLMError } from "@/lib/llm";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the per-message cap in /api/chat - one reply, not an audiobook.
const MAX_TEXT_CHARS = 4000;

const RequestSchema = z.object({ text: z.string().min(1).max(MAX_TEXT_CHARS) });

export async function POST(request: Request) {
  const { allowed, retryAfter } = await checkRateLimit(clientKey(request));
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  let text: string;
  try {
    text = RequestSchema.parse(await request.json()).text;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const provider = getProvider();
  if (!provider.synthesize) {
    return Response.json(
      {
        error: `Voice output isn't supported by the "${provider.name}" provider. Switch LLM_PROVIDER to openai or groq to use it.`,
      },
      { status: 400 },
    );
  }

  try {
    const { data, mimeType } = await provider.synthesize(text);
    return new Response(new Uint8Array(data), {
      headers: { "content-type": mimeType, "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "Speech synthesis failed.";
    const status = error instanceof LLMError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}
