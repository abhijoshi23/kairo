import {
  LLMError,
  parseToolInput,
  type AudioInput,
  type ChatMessage,
  type LLMProvider,
  type ToolDefinition,
} from "./types";
import { describeHttpError, sseLines } from "./sse";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
};

/**
 * OpenAI's /chat/completions shape is a de-facto standard. OpenAI, Groq and
 * Ollama all speak it, so one implementation covers three providers - we vary
 * only the base URL, the key and the default model.
 */

function toOpenAIMessages(system: string, messages: ChatMessage[]) {
  const output: unknown[] = [{ role: "system", content: system }];

  for (const message of messages) {
    if (message.role === "user") {
      output.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      output.push({
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.input) },
              })),
            }
          : {}),
      });
    } else {
      // Unlike Anthropic, OpenAI has a dedicated role for tool output.
      output.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      });
    }
  }

  return output;
}

function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function createOpenAICompatibleProvider(config: {
  name: string;
  baseUrl: string;
  apiKey: () => string | undefined;
  defaultModel: string;
  requiresKey?: boolean;
  /** Set this to expose transcribe() - only providers with a Whisper endpoint need it. */
  whisperModel?: string;
}): LLMProvider {
  return {
    name: config.name,
    defaultModel: config.defaultModel,

    ...(config.whisperModel
      ? {
          async transcribe({ data, mimeType }: AudioInput) {
            const key = config.apiKey();
            if (config.requiresKey !== false && !key) {
              throw new LLMError(
                `No API key configured for provider "${config.name}"`,
                500,
                config.name,
              );
            }

            const extension = EXTENSION_BY_MIME[mimeType] ?? "webm";
            const form = new FormData();
            form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), `audio.${extension}`);
            form.append("model", config.whisperModel!);

            const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
              method: "POST",
              headers: { authorization: `Bearer ${key ?? "local"}` },
              body: form,
            });

            if (!response.ok) {
              throw new LLMError(await describeHttpError(response), response.status, config.name);
            }

            const json = await response.json();
            return (json.text ?? "").trim();
          },
        }
      : {}),

    async *stream({ system, messages, model, temperature, maxTokens, tools, signal }) {
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
          messages: toOpenAIMessages(system, messages),
          temperature,
          max_tokens: maxTokens,
          stream: true,
          ...(tools.length > 0
            ? { tools: toOpenAITools(tools), tool_choice: "auto" }
            : {}),
        }),
        signal,
      });

      if (!response.ok) {
        throw new LLMError(await describeHttpError(response), response.status, config.name);
      }

      /**
       * Tool calls stream as partial fragments keyed by `index`: the id and
       * name usually arrive in the first chunk, then `arguments` dribbles in
       * as text. We assemble them and emit once the stream ends.
       */
      const pending = new Map<number, { id: string; name: string; args: string }>();

      for await (const data of sseLines(response)) {
        if (!data || data === "[DONE]") continue;
        let event: any;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const delta = event.choices?.[0]?.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          yield { type: "text", text: delta.content };
        }

        for (const call of delta.tool_calls ?? []) {
          const index = call.index ?? 0;
          const existing = pending.get(index) ?? { id: "", name: "", args: "" };
          if (call.id) existing.id = call.id;
          if (call.function?.name) existing.name = call.function.name;
          if (call.function?.arguments) existing.args += call.function.arguments;
          pending.set(index, existing);
        }
      }

      for (const block of pending.values()) {
        if (!block.name) continue;
        yield {
          type: "tool_call",
          call: {
            id: block.id || `call_${Math.random().toString(36).slice(2)}`,
            name: block.name,
            input: parseToolInput(block.args),
          },
        };
      }
    },
  };
}
