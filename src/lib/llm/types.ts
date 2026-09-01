/**
 * The contract every LLM provider must satisfy.
 *
 * The whole point of this file: the rest of the app never imports
 * "anthropic" or "openai" directly. It imports `LLMProvider`. That is what
 * makes the app provider-agnostic - swapping vendors is one env var, not a
 * refactor.
 */

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Exclude<Role, "system">;
  content: string;
}

export interface StreamOptions {
  /** The persona / instructions. Sent separately from the conversation. */
  system: string;
  /** The conversation so far, oldest first. */
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  /** Lets us cancel the upstream request if the browser disconnects. */
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  /**
   * Yields text fragments as the model produces them.
   * An async generator is the natural shape for streaming: the caller can
   * `for await` over it and forward each piece straight to the browser.
   */
  stream(options: StreamOptions): AsyncGenerator<string>;
}

/** An error we are willing to describe to the client. */
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
