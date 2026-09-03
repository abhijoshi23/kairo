import { cookies } from "next/headers";
import { z } from "zod";

import { COOKIE_NAME, getPassphrase, verifySessionToken } from "@/lib/auth";
import {
  getGenerationSettings,
  getModel,
  getProvider,
  LLMError,
  type ChatMessage,
  type ToolCall,
} from "@/lib/llm";
import { buildSystemPrompt } from "@/lib/persona";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { getToolDefinitions, runTool } from "@/lib/tools";

/**
 * The server half of the app.
 *
 *   1. Keep the API key on the server. The browser never sees it.
 *   2. Validate and bound the input before spending money on it.
 *   3. Run the agent loop and stream the result back.
 *
 * The agent loop is the part that changed when web search arrived. A plain
 * chat request is one call to the model. A tool-enabled request is a
 * conversation: the model asks for a search, we run it, we hand back the
 * results, and it asks again or answers. Each turn re-sends the whole
 * conversation, so the loop MUST be bounded - see MAX_TOOL_ROUNDS.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bounds on what one request may cost.
 *
 * Do the arithmetic before choosing these numbers. Each tool round is another
 * full model call carrying the whole conversation plus every result so far, so
 * cost grows faster than linearly. Three rounds plus a forced final answer is
 * enough for "search, refine, answer" and cannot run away.
 */
const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 24_000;
const MAX_TOOL_ROUNDS = 3;
const MAX_TOTAL_SEARCHES = 4;

const RequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES)
    .refine(
      (messages) =>
        messages.reduce((total, message) => total + message.content.length, 0) <= MAX_TOTAL_CHARS,
      { message: "Conversation is too long." },
    ),
});

/**
 * Newline-delimited JSON, one event per line. Once streaming starts the HTTP
 * status is already sent, so structured events are the only way to express
 * "a tool is running", "here are the sources", or "this failed mid-stream".
 */
function line(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload) + "\n");
}

export async function POST(request: Request) {
  // --- 0. Authentication ---------------------------------------------------
  const passphrase = getPassphrase();
  if (process.env.NODE_ENV === "production" || passphrase) {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!passphrase || !(await verifySessionToken(token, passphrase))) {
      return Response.json({ error: "Not signed in." }, { status: 401 });
    }
  }

  // --- 1. Rate limit -------------------------------------------------------
  const { allowed, retryAfter } = await checkRateLimit(clientKey(request));
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // --- 2. Validate ---------------------------------------------------------
  let incoming: Array<{ role: "user" | "assistant"; content: string }>;
  try {
    incoming = RequestSchema.parse(await request.json()).messages;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // --- 3. Set up -----------------------------------------------------------
  let provider;
  try {
    provider = getProvider();
  } catch (error) {
    const message = error instanceof LLMError ? error.message : "Provider misconfigured.";
    return Response.json({ error: message }, { status: 500 });
  }

  const { temperature, maxTokens } = getGenerationSettings();
  const model = getModel(provider);
  const tools = getToolDefinitions();
  const system = buildSystemPrompt({ searchEnabled: tools.length > 0 });

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  // --- 4. Agent loop -------------------------------------------------------
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const conversation: ChatMessage[] = incoming.map((message) => ({ ...message }));
      let searchesUsed = 0;

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          // On the final round we withdraw the tools, which forces the model
          // to answer with what it has instead of asking for more.
          const offerTools = round < MAX_TOOL_ROUNDS && searchesUsed < MAX_TOTAL_SEARCHES;

          let assistantText = "";
          const calls: ToolCall[] = [];

          for await (const event of provider.stream({
            system,
            messages: conversation,
            model,
            temperature,
            maxTokens,
            tools: offerTools ? tools : [],
            signal: abortController.signal,
          })) {
            if (event.type === "text") {
              assistantText += event.text;
              controller.enqueue(line({ type: "delta", text: event.text }));
            } else {
              calls.push(event.call);
            }
          }

          if (calls.length === 0) break;

          // Record what the model asked for, then answer each request.
          conversation.push({
            role: "assistant",
            content: assistantText,
            toolCalls: calls,
          });

          for (const call of calls) {
            if (searchesUsed >= MAX_TOTAL_SEARCHES) {
              conversation.push({
                role: "tool",
                toolCallId: call.id,
                toolName: call.name,
                content: "Search limit reached for this message. Answer with what you have.",
              });
              continue;
            }
            searchesUsed += 1;

            const query = typeof call.input.query === "string" ? call.input.query : "";
            controller.enqueue(line({ type: "tool_start", name: call.name, query }));

            const result = await runTool(call, abortController.signal);

            controller.enqueue(line({ type: "tool_end", name: call.name, sources: result.sources }));
            conversation.push({
              role: "tool",
              toolCallId: call.id,
              toolName: call.name,
              content: result.forModel,
            });
          }
        }

        controller.enqueue(line({ type: "done" }));
      } catch (error) {
        const message =
          error instanceof LLMError ? error.message : "The model stream failed unexpectedly.";
        console.error("[chat] stream failed:", error);
        controller.enqueue(line({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
