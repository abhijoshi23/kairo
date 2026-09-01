import { LLMError, type LLMProvider } from "./types";
import { describeHttpError, sseLines } from "./sse";

/**
 * Anthropic's Messages API. Note two things that differ from OpenAI:
 *  1. The system prompt is a top-level `system` field, not a message.
 *  2. `max_tokens` is required.
 */
export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  defaultModel: "claude-sonnet-4-5",

  async *stream({ system, messages, model, temperature, maxTokens, signal }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMError("ANTHROPIC_API_KEY is not set in .env.local", 500, "anthropic");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new LLMError(await describeHttpError(response), response.status, "anthropic");
    }

    for await (const data of sseLines(response)) {
      if (!data) continue;
      let event: any;
      try {
        event = JSON.parse(data);
      } catch {
        continue; // ignore keep-alive / malformed lines
      }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield event.delta.text as string;
      } else if (event.type === "error") {
        throw new LLMError(event.error?.message ?? "Upstream stream error", 502, "anthropic");
      }
    }
  },
};
