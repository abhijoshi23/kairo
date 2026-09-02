/**
 * The contract every LLM provider must satisfy.
 *
 * This file grew when web search was added, and the way it grew is the lesson.
 * A streaming text API is a one-way pipe: model -> string. Tool calling turns
 * that into a conversation between your code and the model:
 *
 *     model: "I want to call web_search with {query: '...'}"
 *     you:   "here is what it returned"
 *     model: "…and here is the answer"
 *
 * So a stream can no longer yield only strings, and a message can no longer be
 * only text. Everything below follows from those two facts.
 */

/** A request from the model to run one of your functions. */
export interface ToolCall {
  /** Provider-assigned id. Results must be sent back referencing it. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** What we advertise to the model. `inputSchema` is plain JSON Schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Our provider-neutral message format. Each vendor shapes these differently -
 * Anthropic uses content blocks, OpenAI uses a separate "tool" role - and the
 * adapters translate. The rest of the app only ever sees this.
 */
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

/** What a stream yields: prose, or a request to run something. */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall };

export interface StreamOptions {
  system: string;
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  /** Empty array = plain chat, no tools offered. */
  tools: ToolDefinition[];
  signal?: AbortSignal;
}

export interface AudioInput {
  data: Buffer;
  mimeType: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  stream(options: StreamOptions): AsyncGenerator<StreamEvent>;
  /** Speech-to-text. Absent when the provider has no transcription endpoint. */
  transcribe?(audio: AudioInput): Promise<string>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
    readonly provider?: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Tolerant JSON parse for tool arguments streamed as text fragments. */
export function parseToolInput(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
