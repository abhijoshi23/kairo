import { LLMError, type LLMProvider } from "./types";
import { describeHttpError, sseLines } from "./sse";

/**
 * OpenAI's /chat/completions shape became a de-facto standard. OpenAI, Groq
 * and Ollama all speak it, so one implementation covers three providers -
 * we just vary the base URL, the key and the default model.
 *
 * This is a factory: call it with config, get back an LLMProvider.
 */
export function createOpenAICompatibleProvider(config: {
  name: string;
  baseUrl: string;
  apiKey: () => string | undefined;
  defaultModel: string;
  /** Some local servers (Ollama) need no real key. */
  requiresKey?: boolean;
}): LLMProvider {
  return {
    name: config.name,
    defaultModel: config.defaultModel,

    async *stream({ system, messages, model, temperature, maxTokens, signal }) {
      const key = config.apiKey();
      if (config.requiresKey !== false && !key) {
        throw new LLMError(
          `No API key configured for provider "${config.name}"`,
          500,
          config.name,
        );
      }

      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key ?? "local"}`,
        },
        body: JSON.stringify({
          model,
          // Here the system prompt is just the first message.
          messages: [{ role: "system", content: system }, ...messages],
          temperature,
          max_tokens: maxTokens,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        throw new LLMError(await describeHttpError(response), response.status, config.name);
      }

      for await (const data of sseLines(response)) {
        if (!data || data === "[DONE]") continue;
        let event: any;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        const piece = event.choices?.[0]?.delta?.content;
        if (typeof piece === "string" && piece.length > 0) yield piece;
      }
    },
  };
}
