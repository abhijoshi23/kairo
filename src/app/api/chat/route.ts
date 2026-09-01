import { z } from "zod";
import {
  getGenerationSettings,
  getModel,
  getProvider,
  LLMError,
  type ChatMessage,
} from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/persona";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * The server half of the app. Three responsibilities, in order:
 *
 *   1. Keep the API key on the server. The browser never sees it. This is the
 *      single most important reason this route exists at all - a "call the LLM
 *      from the frontend" app leaks your key to anyone who opens devtools.
 *   2. Validate and bound the input before spending money on it.
 *   3. Stream the model's output back so the page feels alive.
 */

// Node runtime (not edge) so we can use the full fetch/stream API predictably.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

/**
 * We answer with newline-delimited JSON rather than raw text. One line per
 * event means the client can tell the difference between "here is more text",
 * "we are finished", and "something went wrong mid-stream" - which raw text
 * cannot express once the response headers are already sent.
 */
function line(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload) + "\n");
}

export async function POST(request: Request) {
  // --- 1. Rate limit -------------------------------------------------------
  const { allowed, retryAfter } = checkRateLimit(clientKey(request));
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // --- 2. Validate ---------------------------------------------------------
  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = RequestSchema.parse(body).messages;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // --- 3. Stream -----------------------------------------------------------
  let provider;
  try {
    provider = getProvider();
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "Provider misconfigured.";
    return Response.json({ error: message }, { status: 500 });
  }

  const { temperature, maxTokens } = getGenerationSettings();
  const controller = new AbortController();
  // If the user closes the tab, stop paying for tokens nobody will read.
  request.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        const tokens = provider.stream({
          system: buildSystemPrompt(),
          messages,
          model: getModel(provider),
          temperature,
          maxTokens,
          signal: controller.signal,
        });

        for await (const text of tokens) {
          streamController.enqueue(line({ type: "delta", text }));
        }
        streamController.enqueue(line({ type: "done" }));
      } catch (error) {
        // The response is already streaming, so we cannot change the status
        // code. We send the error as a final event instead.
        const message =
          error instanceof LLMError
            ? error.message
            : "The model stream failed unexpectedly.";
        console.error("[chat] stream failed:", error);
        streamController.enqueue(line({ type: "error", message }));
      } finally {
        streamController.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no", // stop nginx-style proxies from buffering
    },
  });
}
