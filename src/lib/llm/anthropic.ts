import {
  LLMError,
  parseToolInput,
  type ChatMessage,
  type LLMProvider,
  type ToolDefinition,
} from "./types";
import { describeHttpError, sseLines } from "./sse";

/**
 * Anthropic's Messages API.
 *
 * Two structural differences from OpenAI worth knowing:
 *   1. The system prompt is a top-level field, not a message.
 *   2. Tool results are sent as a USER message containing tool_result blocks -
 *      there is no separate "tool" role.
 */

function toAnthropicMessages(messages: ChatMessage[]) {
  const output: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const message of messages) {
    if (message.role === "user") {
      output.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const blocks: unknown[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      output.push({ role: "assistant", content: blocks });
      continue;
    }

    // Tool results ride inside a user turn. Consecutive results merge into one.
    const block = {
      type: "tool_result",
      tool_use_id: message.toolCallId,
      content: message.content,
    };
    const previous = output[output.length - 1];
    if (previous?.role === "user" && Array.isArray(previous.content)) {
      (previous.content as unknown[]).push(block);
    } else {
      output.push({ role: "user", content: [block] });
    }
  }

  return output;
}

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export const anthropicProvider: LLMProvider = {
  name: "anthropic",
  defaultModel: "claude-sonnet-4-5",

  async *stream({ system, messages, model, temperature, maxTokens, tools, signal }) {
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
        messages: toAnthropicMessages(messages),
        max_tokens: maxTokens,
        temperature,
        stream: true,
        ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
      }),
      signal,
    });

    if (!response.ok) {
      throw new LLMError(await describeHttpError(response), response.status, "anthropic");
    }

    /**
     * Tool arguments arrive as a stream of JSON *fragments* (input_json_delta),
     * not as a finished object. We accumulate per content-block index and parse
     * when that block closes. Forgetting this is the classic tool-streaming bug:
     * JSON.parse on a partial string throws.
     */
    const pending = new Map<number, { id: string; name: string; json: string }>();

    for await (const data of sseLines(response)) {
      if (!data) continue;
      let event: any;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      switch (event.type) {
        case "content_block_start":
          if (event.content_block?.type === "tool_use") {
            pending.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              json: "",
            });
          }
          break;

        case "content_block_delta":
          if (event.delta?.type === "text_delta") {
            yield { type: "text", text: event.delta.text as string };
          } else if (event.delta?.type === "input_json_delta") {
            const block = pending.get(event.index);
            if (block) block.json += event.delta.partial_json ?? "";
          }
          break;

        case "content_block_stop": {
          const block = pending.get(event.index);
          if (block) {
            pending.delete(event.index);
            yield {
              type: "tool_call",
              call: { id: block.id, name: block.name, input: parseToolInput(block.json) },
            };
          }
          break;
        }

        case "error":
          throw new LLMError(event.error?.message ?? "Upstream stream error", 502, "anthropic");
      }
    }
  },
};
